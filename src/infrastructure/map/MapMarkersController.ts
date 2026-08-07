import type { MarkerStore } from '@/application/MarkerStore'
import type { SettingsStore } from '@/application/SettingsStore'
import type { MarkerRoute } from '@/domain/route/MarkerRoute'
import type { Coordinate } from '@/shared/game/Coordinate'
import type { GlMap, MapMouseEvent } from '@/shared/game/GlMap'
import type { SubwayBuilderApi } from '@/shared/game/SubwayBuilderApi'

import { OPTIMAL_SPACING_FACTOR } from '@/domain/marker/Marker'
import { snapToSpacing } from '@/domain/marker/SpacingSnap'
import { markerRoutes } from '@/domain/route/MarkerRoute'
import { routeUnderPoint } from '@/domain/route/RouteHitTest'
import { InfluenceRadiusLayer } from '@/infrastructure/map/InfluenceRadiusLayer'
import { MarkerLayer } from '@/infrastructure/map/MarkerLayer'
import { PLACEMENT_CURSOR } from '@/infrastructure/map/placementCursor'
import { RouteDragInteraction } from '@/infrastructure/map/RouteDragInteraction'
import { RouteLineLayer } from '@/infrastructure/map/RouteLineLayer'

// How close a dropped marker has to land to a line, in screen pixels, to join it.
const ON_THE_LINE_PX = 14

type PlacementListener = (active: boolean) => void

// Bridges the shared MarkerStore to the two imperative map layers and owns the
// map-side interactions the panel triggers (drop a marker by clicking the map,
// fly to a marker). Every store change re-renders both layers; a map/city swap is
// re-synced from the lifecycle hooks. The panel talks to the map only through this
// controller, never to the GL instance directly.
export class MapMarkersController {
  private markerLayer: MarkerLayer
  private panelOpen = false
  // Held with the map it was registered on: cancelling has to unregister from that
  // instance, which is not necessarily the one getMap() hands back later.
  private pendingPlacement: null | { handler: (event: MapMouseEvent) => void, map: GlMap } = null
  private placementActive = false
  private placementListeners = new Set<PlacementListener>()
  private radiusLayer: InfluenceRadiusLayer
  private routeDrag: RouteDragInteraction
  private routeLayer: RouteLineLayer

  constructor(
    private readonly api: SubwayBuilderApi,
    private readonly store: MarkerStore,
    private readonly settings: SettingsStore,
  ) {
    const getMap = (): GlMap | null => this.map()
    this.markerLayer = new MarkerLayer(getMap, {
      // Clicking a badge takes you to that station in the panel: its folder unfolds and
      // the card scrolls itself into view.
      onClick: (id) => this.store.reveal(id),
      onDragEnd: (id, position) => {
        this.store.update(id, { position })
        this.store.select(id)
      },
      onDragMove: (id, position) => this.store.update(id, { position }),
      snapPosition: (id, candidate) => this.snapToNeighbors(id, candidate),
    })
    this.radiusLayer = new InfluenceRadiusLayer(getMap)
    // Dragging a line onto a marker puts that marker on the line.
    this.routeDrag = new RouteDragInteraction(getMap, {
      markers: () => this.store.visibleMarkers(),
      onAttach: (markerId, groupId) => {
        this.store.addToGroup(markerId, groupId)
        this.store.reveal(markerId)
      },
      routes: () => this.shownRoutes(),
    })
    // The route outline contrasts with the map, so it follows the theme the game is
    // showing rather than a fixed color. Read per draw: the player can switch it while
    // the mod is loaded.
    this.routeLayer = new RouteLineLayer(getMap, () => this.isDarkTheme())
  }

  cancelPlacement(): void {
    if (!this.placementActive) {
      return
    }
    // Unregister from the map the click was armed on. Going through getMap() here
    // would skip the unregister whenever it returns null or a new instance — as it
    // does around a city load — leaving a live handler that drops a marker the
    // player already backed out of.
    if (this.pendingPlacement) {
      this.pendingPlacement.map.off('click', this.pendingPlacement.handler)
    }
    this.pendingPlacement = null
    this.placementActive = false
    this.notifyPlacement()
  }

  // Fly to a marker and select it (from the panel's "focus" action).
  focus(id: string): void {
    const marker = this.store.all().find((candidate) => candidate.id === id)
    const map = this.map()
    if (marker && map) {
      map.easeTo({ center: marker.position, duration: 400 })
    }
    this.store.select(id)
  }

  isPlacing(): boolean {
    return this.placementActive
  }

  onPlacementChange(listener: PlacementListener): () => void {
    this.placementListeners.add(listener)

    return () => this.placementListeners.delete(listener)
  }

  // The panel wires this to its mount/unmount. A closed panel leaves the markers as a
  // passive overlay — not draggable or clickable, and faded to the configured idle
  // opacity — so they read as a background sketch and don't get in the way of playing.
  setPanelOpen(open: boolean): void {
    if (this.panelOpen === open) {
      return
    }
    this.panelOpen = open
    this.markerLayer.setInteractive(open)
    this.routeDrag.setEnabled(open)
    this.renderLayers()
  }

  start(): void {
    this.store.subscribe(() => this.renderLayers())
    this.settings.subscribe(() => this.renderLayers())
    this.renderLayers()
  }

  // Redraw on the (possibly new) map instance after a city load / map swap. The
  // markers themselves are (re)loaded from the save by the store's own lifecycle
  // wiring, not here.
  syncToMap(): void {
    this.routeDrag.syncToMap()
    this.renderLayers()
  }

  togglePlacement(): void {
    if (this.placementActive) {
      this.cancelPlacement()
    } else {
      this.beginPlacement()
    }
  }

  private beginPlacement(): void {
    const map = this.map()
    if (!map) {
      return
    }
    this.placementActive = true
    const handler = (event: MapMouseEvent): void => {
      this.pendingPlacement = null
      this.placementActive = false
      this.notifyPlacement()
      const position: Coordinate = [event.lngLat.lng, event.lngLat.lat]
      const marker = this.store.add(position)
      // Dropped on a line the player can see: that is where they meant to put a stop,
      // so it joins that folder (at the point of the line it was dropped on).
      const line = this.lineUnder(position)
      if (line) {
        this.store.addToGroup(marker.id, line)
      }
    }
    this.pendingPlacement = { handler, map }
    map.once('click', handler)
    this.notifyPlacement()
  }

  // Defaults to dark, which is the game's own default and the safer guess: a light
  // outline on a dark map is far more wrong than the other way round.
  private isDarkTheme(): boolean {
    try {
      return this.api.ui?.getResolvedTheme?.() !== 'light'
    } catch {
      return true
    }
  }

  // The folder whose line passes under `position`, within a few pixels of it.
  private lineUnder(position: Coordinate): null | string {
    const map = this.map()
    if (!map || !this.settings.get().showRouteLines) {
      return null
    }
    const point = map.project(position)
    const offset = map.unproject([point.x + ON_THE_LINE_PX, point.y])
    const within = Math.abs(offset.lng - position[0]) * Math.cos((position[1] * Math.PI) / 180)

    return routeUnderPoint(this.shownRoutes(), position, within)?.groupId ?? null
  }

  private map(): GlMap | null {
    return (this.api.utils?.getMap?.() ?? null) as GlMap | null
  }

  private notifyPlacement(): void {
    try {
      const container = this.map()?.getCanvasContainer()
      if (container) {
        container.style.cursor = this.placementActive ? PLACEMENT_CURSOR : ''
      }
    } catch {
      /* cursor hint is best-effort */
    }
    for (const listener of this.placementListeners) {
      listener(this.placementActive)
    }
  }

  private renderLayers(): void {
    const settings = this.settings.get()
    const opacity = this.panelOpen ? 1 : settings.idleOpacity
    // The map draws only visible markers — a hidden folder's markers drop off here
    // while staying in the panel — so the badges and their influence circles share the
    // same set.
    const markers = this.store.visibleMarkers()
    this.markerLayer.render(markers, this.store.selected(), { opacity, showLabels: settings.showLabels })
    this.radiusLayer.render(markers, settings, opacity)
    // Drawn after the circles so the route reads on top of them. Only the folders that
    // are shown draw a line, but each of those lines is resolved against the whole
    // board: a marker it shares with a hidden folder is still on it.
    this.routeLayer.render(settings.showRouteLines ? this.shownRoutes() : [], opacity)
  }

  // The lines currently on the map: one per folder that is shown, resolved against the
  // whole board (a marker it shares with a hidden folder is still on it).
  private shownRoutes(): MarkerRoute[] {
    return markerRoutes(this.store.all(), this.store.groups().filter((group) => !group.hidden))
  }

  // Magnetic placement aid: pull a dragged marker onto the ideal spacing (√3·R) from
  // its neighbors. Gated on its own setting, independent of whether the guide rings
  // are shown.
  private snapToNeighbors(draggingId: string, candidate: Coordinate): Coordinate {
    const settings = this.settings.get()
    if (!settings.snapToSpacing) {
      return candidate
    }
    const neighbors = this.store
      .visibleMarkers()
      .filter((marker) => marker.id !== draggingId)
      .map((marker) => marker.position)

    return snapToSpacing(candidate, neighbors, settings.radiusMeters * OPTIMAL_SPACING_FACTOR)
  }
}
