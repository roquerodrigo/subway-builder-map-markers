import type { MarkerRoute } from '@/domain/route/MarkerRoute'
import type { GlMap } from '@/shared/game/GlMap'

import { stationPath } from '@/domain/route/StationPath'

const SOURCE_ID = 'sbmm-route'
const CASING_LAYER = 'sbmm-route-casing'
const LINE_LAYER = 'sbmm-route-line'
const PLATFORM_LAYER = 'sbmm-route-platform'
const PLATFORM_CASING_LAYER = 'sbmm-route-platform-casing'
const RETRY_DELAY_MS = 120
const MAX_RETRIES = 25
const LINE_OPACITY = 0.9
const LINE_WIDTH = 4
// The platform reads as the station itself: same color, drawn solid and heavier than
// the dashed run between stations.
const PLATFORM_WIDTH = 7
const PLATFORM_OPACITY = 0.95
// Dashed between stations, so the guide never reads as track already built — the
// game's own routes are solid. Both figures are pixels: `line-dasharray` is in
// multiples of the line width, so each layer needs its own numbers.
const DASH_LENGTH_PX = 11
const DASH_GAP_PX = 7
// The casing is an outline, not a shadow: it has to sit outside the colored line on
// every side, so it is wider *and* its dashes are longer, wrapping each dash's ends.
const OUTLINE_PX = 1
// Held well back: the outline is there to separate a line from the map and from the
// lines beside it, not to be seen. Any heavier and 20 folders' worth of edges wash the
// colors out into one pale tangle.
const CASING_OPACITY = 0.45
// The outline contrasts with the map, not with the line: that's what keeps a line
// readable whatever color it is — the near-black of a "Ônix" line would vanish into a
// dark map without a light edge, and a pale line into a light one. The game tells us
// which theme is showing.
const OUTLINE_ON_DARK = '#f1f5f9'
const OUTLINE_ON_LIGHT = '#0b0f16'
const LINE_FILTER = ['==', ['get', 'role'], 'line']
const PLATFORM_FILTER = ['==', ['get', 'role'], 'platform']

// Draws each folder's route: the platforms of its stations and the dashed curve running
// through them, in panel order, as a guide for where the track should run.
//
// The geometry carries the whole shape (see domain/route/StationPath): a GL line layer
// joins its vertices with straight segments, so both the curve and the straight run
// through each platform have to be baked in. The map is fetched fresh on every call
// (the game can replace it on city load) and a first draw before the style is ready
// retries on a timer.
export class RouteLineLayer {
  private opacity = 1
  private outlineColor = OUTLINE_ON_DARK
  private retries = 0
  private routes: MarkerRoute[] = []

  constructor(
    private readonly getMap: () => GlMap | null,
    private readonly isDarkTheme: () => boolean = () => true,
  ) {}

  // An empty `routes` clears the lines while leaving the layers in place — that's how
  // the setting turning off, or every folder being hidden, reaches the map.
  render(routes: MarkerRoute[], opacity: number): void {
    this.routes = routes
    this.opacity = opacity
    this.outlineColor = this.isDarkTheme() ? OUTLINE_ON_DARK : OUTLINE_ON_LIGHT
    this.retries = 0
    this.draw()
  }

  private draw(): void {
    const map = this.getMap()
    if (!map) {
      return
    }
    const data = this.featureCollection()

    const source = map.getSource(SOURCE_ID)
    if (source) {
      source.setData(data)
      this.ensureLayers(map)

      return
    }

    if (!map.isStyleLoaded()) {
      this.retryDraw()

      return
    }
    try {
      map.addSource(SOURCE_ID, { data, type: 'geojson' })
      this.ensureLayers(map)
    } catch {
      this.retryDraw()
    }
  }

  private ensureLayers(map: GlMap): void {
    // Casing first, so the colored line and the platforms draw on top of it.
    if (!map.getLayer(CASING_LAYER)) {
      map.addLayer({
        filter: LINE_FILTER,
        id: CASING_LAYER,
        // A dashed line can't have round caps — every dash would grow its own — so the
        // dashes are butt-ended and only the joins are rounded.
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': this.outlineColor,
          'line-dasharray': casingDash(),
          'line-opacity': this.scaled(CASING_OPACITY),
          'line-width': LINE_WIDTH + OUTLINE_PX * 2,
        },
        source: SOURCE_ID,
        type: 'line',
      })
    }
    if (!map.getLayer(LINE_LAYER)) {
      map.addLayer({
        filter: LINE_FILTER,
        id: LINE_LAYER,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-dasharray': dashFor(LINE_WIDTH),
          'line-opacity': this.scaled(LINE_OPACITY),
          'line-width': LINE_WIDTH,
        },
        source: SOURCE_ID,
        type: 'line',
      })
    }
    // The platform carries the same outline, solid, so the station reads over the map
    // and over the line running into it.
    if (!map.getLayer(PLATFORM_CASING_LAYER)) {
      map.addLayer({
        filter: PLATFORM_FILTER,
        id: PLATFORM_CASING_LAYER,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': this.outlineColor,
          'line-opacity': this.scaled(CASING_OPACITY),
          'line-width': PLATFORM_WIDTH + OUTLINE_PX * 2,
        },
        source: SOURCE_ID,
        type: 'line',
      })
    }
    // The platform sits above the dashed run: it is the station, drawn solid.
    if (!map.getLayer(PLATFORM_LAYER)) {
      map.addLayer({
        filter: PLATFORM_FILTER,
        id: PLATFORM_LAYER,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-opacity': this.scaled(PLATFORM_OPACITY),
          'line-width': PLATFORM_WIDTH,
        },
        source: SOURCE_ID,
        type: 'line',
      })
    }
    // Keep the paint/filters in sync so a tweaked value (or a switched theme) applies
    // to a layer that already exists rather than being ignored.
    map.setFilter(CASING_LAYER, LINE_FILTER)
    map.setFilter(LINE_LAYER, LINE_FILTER)
    map.setFilter(PLATFORM_CASING_LAYER, PLATFORM_FILTER)
    map.setFilter(PLATFORM_LAYER, PLATFORM_FILTER)
    map.setPaintProperty(CASING_LAYER, 'line-color', this.outlineColor)
    map.setPaintProperty(CASING_LAYER, 'line-dasharray', casingDash())
    map.setPaintProperty(CASING_LAYER, 'line-opacity', this.scaled(CASING_OPACITY))
    map.setPaintProperty(LINE_LAYER, 'line-dasharray', dashFor(LINE_WIDTH))
    map.setPaintProperty(LINE_LAYER, 'line-opacity', this.scaled(LINE_OPACITY))
    map.setPaintProperty(PLATFORM_CASING_LAYER, 'line-color', this.outlineColor)
    map.setPaintProperty(PLATFORM_CASING_LAYER, 'line-opacity', this.scaled(CASING_OPACITY))
    map.setPaintProperty(PLATFORM_LAYER, 'line-opacity', this.scaled(PLATFORM_OPACITY))
  }

  private featureCollection(): unknown {
    const features: unknown[] = []
    for (const route of this.routes) {
      const drawn = stationPath(route.points)
      features.push(feature(drawn.path, route, 'line'))
      for (const platform of drawn.platforms) {
        features.push(feature(platform, route, 'platform'))
      }
    }

    return { features, type: 'FeatureCollection' }
  }

  private retryDraw(): void {
    if (this.retries >= MAX_RETRIES) {
      return
    }
    this.retries++
    setTimeout(() => this.draw(), RETRY_DELAY_MS)
  }

  private scaled(layerOpacity: number): number {
    return layerOpacity * this.opacity
  }
}

// The casing dashes are longer than the line's by the outline it adds on each end, so a
// dash comes out wrapped on all four sides rather than only along its length.
function casingDash(): number[] {
  const width = LINE_WIDTH + OUTLINE_PX * 2

  return [(DASH_LENGTH_PX + OUTLINE_PX * 2) / width, (DASH_GAP_PX - OUTLINE_PX * 2) / width]
}

// The same dash on the ground whatever line it is drawn on: the renderer reads the
// pattern in multiples of the line's own width.
function dashFor(width: number): number[] {
  return [DASH_LENGTH_PX / width, DASH_GAP_PX / width]
}

function feature(coordinates: unknown, route: MarkerRoute, role: string): unknown {
  return {
    geometry: { coordinates, type: 'LineString' },
    properties: { color: route.color, groupId: route.groupId, role },
    type: 'Feature',
  }
}
