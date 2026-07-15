import type { Marker } from '@/domain/marker/Marker'
import type { MarkerSettings } from '@/domain/settings/MarkerSettings'
import type { GlMap } from '@/shared/game/GlMap'

import { geodesicCircle } from '@/domain/marker/GeodesicCircle'
import { OPTIMAL_SPACING_FACTOR } from '@/domain/marker/Marker'

const SOURCE_ID = 'sbmm-radius'
const FILL_LAYER = 'sbmm-radius-fill'
const LINE_LAYER = 'sbmm-radius-line'
const GUIDE_LAYER = 'sbmm-radius-guide'
const RETRY_DELAY_MS = 120
const MAX_RETRIES = 25
// Coverage is one flat union — every circle goes into a single MultiPolygon
// feature, so overlaps never compound into darker patches (a point is either
// covered or not, at one uniform opacity). Per-marker identity comes from the
// colored dashed outline at the influence radius.
const COVERAGE_COLOR = '#cbd5e1'
const COVERAGE_FILL_OPACITY = 0.1
const LINE_OPACITY = 0.75
// The spacing guide is a faint ring at √3·R around each marker — the ideal distance
// to a neighbor. Drop a neighbor's marker onto this ring and the two influence
// areas meet with the least overlap that still leaves no gap; do it across a cluster
// and three areas meet at a single point (the optimal hexagonal covering). The
// target sits *outside* the influence radius, so it can't be an inner ring — it has
// to be its own guide circle.
const SPACING_RADIUS_FRACTION = OPTIMAL_SPACING_FACTOR
// A neutral color (not the marker's) so the guide reads as a target line, not as
// another colored influence area.
const GUIDE_COLOR = '#f8fafc'
const GUIDE_OPACITY = 0.55
const COVERAGE_FILTER = ['==', ['get', 'role'], 'coverage']
const OUTLINE_FILTER = ['==', ['get', 'role'], 'outline']
const GUIDE_FILTER = ['==', ['get', 'role'], 'guide']

// Draws the influence radius of every marker (when the global "show influence area"
// setting is on) as real geographic circles, so they scale with zoom and stay a
// true radius on the ground at the configured size. The fill is the flat union of
// all circles; each marker also gets a colored outline at the influence radius and
// a faint spacing-guide ring at √3·R (where neighbors should sit for minimal
// overlap with no gap). The map is fetched fresh on every call (the game can replace
// the map on city load); a first draw before the style is ready retries on a timer.
export class InfluenceRadiusLayer {
  private markers: Marker[] = []
  private opacity = 1
  private radiusMeters = 0
  private retries = 0
  private showGuide = false
  private showInfluence = false

  constructor(private readonly getMap: () => GlMap | null) {}

  // `opacity` scales every layer's own opacity, so the circles fade with the badges
  // (the controller resolves it from the panel state) and keep their relative weight.
  render(markers: Marker[], settings: MarkerSettings, opacity: number): void {
    this.markers = markers
    this.radiusMeters = settings.radiusMeters
    this.showInfluence = settings.showInfluence
    this.showGuide = settings.showSpacingGuide
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
    if (!map.getLayer(FILL_LAYER)) {
      map.addLayer({
        filter: COVERAGE_FILTER,
        id: FILL_LAYER,
        paint: {
          'fill-color': COVERAGE_COLOR,
          'fill-opacity': this.scaled(COVERAGE_FILL_OPACITY),
        },
        source: SOURCE_ID,
        type: 'fill',
      })
    }
    // Guide first, so the influence outline draws on top of it.
    if (!map.getLayer(GUIDE_LAYER)) {
      map.addLayer({
        filter: GUIDE_FILTER,
        id: GUIDE_LAYER,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': GUIDE_COLOR,
          'line-dasharray': [1, 3],
          'line-opacity': this.scaled(GUIDE_OPACITY),
          'line-width': 1.5,
        },
        source: SOURCE_ID,
        type: 'line',
      })
    }
    if (!map.getLayer(LINE_LAYER)) {
      map.addLayer({
        filter: OUTLINE_FILTER,
        id: LINE_LAYER,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-dasharray': [2, 2],
          'line-opacity': this.scaled(LINE_OPACITY),
          'line-width': 2,
        },
        source: SOURCE_ID,
        type: 'line',
      })
    }
    // Keep the paint/filters in sync so a tweaked value (or a re-injected build)
    // applies to a layer that already exists rather than being ignored.
    map.setFilter(FILL_LAYER, COVERAGE_FILTER)
    map.setFilter(LINE_LAYER, OUTLINE_FILTER)
    map.setFilter(GUIDE_LAYER, GUIDE_FILTER)
    map.setPaintProperty(FILL_LAYER, 'fill-color', COVERAGE_COLOR)
    map.setPaintProperty(FILL_LAYER, 'fill-opacity', this.scaled(COVERAGE_FILL_OPACITY))
    map.setPaintProperty(LINE_LAYER, 'line-opacity', this.scaled(LINE_OPACITY))
    map.setPaintProperty(GUIDE_LAYER, 'line-color', GUIDE_COLOR)
    map.setPaintProperty(GUIDE_LAYER, 'line-opacity', this.scaled(GUIDE_OPACITY))
  }

  private featureCollection(): unknown {
    const features: unknown[] = []
    if (this.showInfluence && this.markers.length > 0) {
      // One union feature for the fill: overlapping circles in a single MultiPolygon
      // render as their union (nonzero winding), so overlaps don't stack up.
      features.push({
        geometry: {
          coordinates: this.markers.map((marker) => [geodesicCircle(marker.position, this.radiusMeters)]),
          type: 'MultiPolygon',
        },
        properties: { role: 'coverage' },
        type: 'Feature',
      })
      for (const marker of this.markers) {
        features.push(this.ring(marker, this.radiusMeters, 'outline'))
      }
    }
    // The spacing guide is an independent toggle: the ideal-distance ring around each
    // marker, shown even when the influence fill is hidden.
    if (this.showGuide && this.markers.length > 0) {
      for (const marker of this.markers) {
        features.push(this.ring(marker, this.radiusMeters * SPACING_RADIUS_FRACTION, 'guide'))
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

  private ring(marker: Marker, radius: number, role: string): unknown {
    return {
      geometry: {
        coordinates: [geodesicCircle(marker.position, radius)],
        type: 'Polygon',
      },
      properties: { color: marker.color, role },
      type: 'Feature',
    }
  }

  private scaled(layerOpacity: number): number {
    return layerOpacity * this.opacity
  }
}
