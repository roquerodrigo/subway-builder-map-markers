import type { MarkerStore } from '@/application/MarkerStore'
import type { SettingsStore } from '@/application/SettingsStore'
import type { Coordinate } from '@/shared/game/Coordinate'
import type { GlMap, MapMouseEvent } from '@/shared/game/GlMap'
import type { SubwayBuilderApi } from '@/shared/game/SubwayBuilderApi'

import { OPTIMAL_SPACING_FACTOR } from '@/domain/marker/Marker'
import { snapToSpacing } from '@/domain/marker/SpacingSnap'
import { InfluenceRadiusLayer } from '@/infrastructure/map/InfluenceRadiusLayer'
import { MarkerLayer } from '@/infrastructure/map/MarkerLayer'

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

  constructor(
    private readonly api: SubwayBuilderApi,
    private readonly store: MarkerStore,
    private readonly settings: SettingsStore,
  ) {
    const getMap = (): GlMap | null => this.map()
    this.markerLayer = new MarkerLayer(getMap, {
      onClick: (id) => this.store.select(id),
      onDragEnd: (id, position) => {
        this.store.update(id, { position })
        this.store.select(id)
      },
      onDragMove: (id, position) => this.store.update(id, { position }),
      snapPosition: (id, candidate) => this.snapToNeighbors(id, candidate),
    })
    this.radiusLayer = new InfluenceRadiusLayer(getMap)
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
      this.store.add([event.lngLat.lng, event.lngLat.lat])
    }
    this.pendingPlacement = { handler, map }
    map.once('click', handler)
    this.notifyPlacement()
  }

  private map(): GlMap | null {
    return (this.api.utils?.getMap?.() ?? null) as GlMap | null
  }

  private notifyPlacement(): void {
    try {
      const container = this.map()?.getCanvasContainer()
      if (container) {
        container.style.cursor = this.placementActive ? 'crosshair' : ''
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
    this.markerLayer.render(this.store.all(), this.store.selected(), { opacity, showLabels: settings.showLabels })
    this.radiusLayer.render(this.store.all(), settings, opacity)
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
      .all()
      .filter((marker) => marker.id !== draggingId)
      .map((marker) => marker.position)

    return snapToSpacing(candidate, neighbors, settings.radiusMeters * OPTIMAL_SPACING_FACTOR)
  }
}
