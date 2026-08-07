import type { MarkerRoute } from '@/domain/route/MarkerRoute'
import type { GlMap } from '@/shared/game/GlMap'

import { smoothPath } from '@/domain/route/SmoothPath'

const SOURCE_ID = 'sbmm-route'
const CASING_LAYER = 'sbmm-route-casing'
const LINE_LAYER = 'sbmm-route-line'
const RETRY_DELAY_MS = 120
const MAX_RETRIES = 25
// A dark casing under the colored line, so a route stays readable over a pale street
// or another route of a similar color — the same trick the game's own lines use.
const CASING_COLOR = '#0f1115'
const CASING_OPACITY = 0.55
const CASING_WIDTH = 7
const LINE_OPACITY = 0.9
const LINE_WIDTH = 4
// Dashed, so the guide never reads as a line the player already built — the game's own
// routes are solid. Both figures are pixels: `line-dasharray` is in multiples of the
// line width, so the casing (wider) needs its own numbers to keep the same rhythm.
const DASH_LENGTH_PX = 11
const DASH_GAP_PX = 7

// Draws each folder's route: a smooth dashed curve through its markers, in panel
// order, as a guide for where the track should run. Drawn from the same shared store as the
// badges, so a dragged marker bends the line as it moves.
//
// The curve is baked into the geometry (see domain/route/SmoothPath) rather than left
// to the renderer: a GL line layer joins its vertices with straight segments, so a
// bare marker-to-marker polyline would be a chain of corners. The map is fetched fresh
// on every call (the game can replace it on city load) and a first draw before the
// style is ready retries on a timer.
export class RouteLineLayer {
  private opacity = 1
  private retries = 0
  private routes: MarkerRoute[] = []

  constructor(private readonly getMap: () => GlMap | null) {}

  // An empty `routes` clears the lines while leaving the layers in place — that's how
  // the setting turning off, or every folder being hidden, reaches the map.
  render(routes: MarkerRoute[], opacity: number): void {
    this.routes = routes
    this.opacity = opacity
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
    // Casing first, so the colored line draws on top of it.
    if (!map.getLayer(CASING_LAYER)) {
      map.addLayer({
        id: CASING_LAYER,
        // A dashed line can't have round caps — every dash would grow its own — so the
        // dashes are butt-ended and only the joins are rounded.
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': CASING_COLOR,
          'line-dasharray': dashFor(CASING_WIDTH),
          'line-opacity': this.scaled(CASING_OPACITY),
          'line-width': CASING_WIDTH,
        },
        source: SOURCE_ID,
        type: 'line',
      })
    }
    if (!map.getLayer(LINE_LAYER)) {
      map.addLayer({
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
    // Keep the paint in sync so a tweaked value (or a re-injected build) applies to a
    // layer that already exists rather than being ignored.
    map.setPaintProperty(CASING_LAYER, 'line-color', CASING_COLOR)
    map.setPaintProperty(CASING_LAYER, 'line-dasharray', dashFor(CASING_WIDTH))
    map.setPaintProperty(CASING_LAYER, 'line-opacity', this.scaled(CASING_OPACITY))
    map.setPaintProperty(LINE_LAYER, 'line-dasharray', dashFor(LINE_WIDTH))
    map.setPaintProperty(LINE_LAYER, 'line-opacity', this.scaled(LINE_OPACITY))
  }

  private featureCollection(): unknown {
    return {
      features: this.routes.map((route) => ({
        geometry: { coordinates: smoothPath(route.points), type: 'LineString' },
        properties: { color: route.color, groupId: route.groupId },
        type: 'Feature',
      })),
      type: 'FeatureCollection',
    }
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

// The same dash on the ground whatever line it is drawn on: the renderer reads the
// pattern in multiples of the line's own width.
function dashFor(width: number): number[] {
  return [DASH_LENGTH_PX / width, DASH_GAP_PX / width]
}
