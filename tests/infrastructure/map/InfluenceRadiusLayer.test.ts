import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Marker } from '../../../src/domain/marker/Marker'
import type { MarkerSettings } from '../../../src/domain/settings/MarkerSettings'
import type { FakeGlMap } from './fakeGlMap'

import { geodesicCircle } from '../../../src/domain/marker/GeodesicCircle'
import { OPTIMAL_SPACING_FACTOR } from '../../../src/domain/marker/Marker'
import { InfluenceRadiusLayer } from '../../../src/infrastructure/map/InfluenceRadiusLayer'
import { createFakeGlMap } from './fakeGlMap'

const SOURCE_ID = 'sbmm-radius'
const FILL_LAYER = 'sbmm-radius-fill'
const GUIDE_LAYER = 'sbmm-radius-guide'
const LINE_LAYER = 'sbmm-radius-line'
const RETRY_DELAY_MS = 120
const MAX_RETRIES = 25

interface Feature {
  type: string
  properties: { role: string, color?: string }
  geometry: { type: string, coordinates: number[][][] | number[][][][] }
}

interface FeatureCollection {
  type: string
  features: Feature[]
}

function makeSettings(overrides: Partial<MarkerSettings> = {}): MarkerSettings {
  return {
    idleOpacity: 0.5,
    radiusMeters: 500,
    showInfluence: true,
    showLabels: true,
    showSpacingGuide: false,
    snapToSpacing: false,
    ...overrides,
  }
}

function makeMarker(overrides: Partial<Marker> = {}): Marker {
  return { id: 'alpha', position: [-46.6, -23.5], color: '#ef4444', icon: 'station', label: 'Alpha', ...overrides }
}

describe('InfluenceRadiusLayer', () => {
  let map: FakeGlMap
  let currentMap: FakeGlMap | null

  function makeLayer(): InfluenceRadiusLayer {
    return new InfluenceRadiusLayer(() => currentMap)
  }

  function drawnData(): FeatureCollection {
    return map.sourceData(SOURCE_ID) as FeatureCollection
  }

  function featuresWithRole(role: string): Feature[] {
    return drawnData().features.filter((feature) => feature.properties.role === role)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    map = createFakeGlMap()
    currentMap = map
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  describe('setting the overlay up', () => {
    it('does nothing while the game has no map', () => {
      currentMap = null
      expect(() => makeLayer().render([makeMarker()], makeSettings(), 1)).not.toThrow()
      expect(map.addSource).not.toHaveBeenCalled()
    })

    it('adds one geojson source for every circle it draws', () => {
      makeLayer().render([makeMarker()], makeSettings(), 1)
      expect(map.addSource).toHaveBeenCalledTimes(1)
      expect(map.addSource).toHaveBeenCalledWith(SOURCE_ID, expect.objectContaining({ type: 'geojson' }))
    })

    it('adds a fill, a guide and an outline layer', () => {
      makeLayer().render([makeMarker()], makeSettings(), 1)
      expect(map.layers.get(FILL_LAYER)?.type).toBe('fill')
      expect(map.layers.get(GUIDE_LAYER)?.type).toBe('line')
      expect(map.layers.get(LINE_LAYER)?.type).toBe('line')
    })

    // The influence outline has to read on top of the fainter spacing guide.
    it('puts the guide underneath the influence outline', () => {
      makeLayer().render([makeMarker()], makeSettings(), 1)
      expect(map.layerOrder.indexOf(GUIDE_LAYER)).toBeLessThan(map.layerOrder.indexOf(LINE_LAYER))
    })

    it('draws each circle in its own marker color through a data-driven paint', () => {
      makeLayer().render([makeMarker()], makeSettings(), 1)
      expect(map.layers.get(LINE_LAYER)?.paint['line-color']).toEqual(['get', 'color'])
    })

    it('splits the roles across the layers by filter', () => {
      makeLayer().render([makeMarker()], makeSettings(), 1)
      expect(map.layers.get(FILL_LAYER)?.filter).toEqual(['==', ['get', 'role'], 'coverage'])
      expect(map.layers.get(LINE_LAYER)?.filter).toEqual(['==', ['get', 'role'], 'outline'])
      expect(map.layers.get(GUIDE_LAYER)?.filter).toEqual(['==', ['get', 'role'], 'guide'])
    })

    it('updates the existing source instead of adding it twice', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], makeSettings(), 1)
      layer.render([makeMarker(), makeMarker({ id: 'beta', position: [-46.5, -23.4] })], makeSettings(), 1)
      expect(map.addSource).toHaveBeenCalledTimes(1)
      expect(map.sources.get(SOURCE_ID)?.setData).toHaveBeenCalledTimes(1)
      expect(featuresWithRole('outline')).toHaveLength(2)
    })

    it('leaves the layers alone when they already exist', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], makeSettings(), 1)
      map.addLayer.mockClear()
      layer.render([makeMarker()], makeSettings(), 1)
      expect(map.addLayer).not.toHaveBeenCalled()
    })

    // A re-injected build (or a tweaked constant) has to reach a layer that the
    // previous run already created, rather than being silently ignored.
    it('re-applies the paint and the filters to layers that already exist', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], makeSettings(), 1)
      map.setPaintProperty.mockClear()
      map.setFilter.mockClear()
      layer.render([makeMarker()], makeSettings(), 0.5)
      expect(map.setFilter).toHaveBeenCalledWith(FILL_LAYER, ['==', ['get', 'role'], 'coverage'])
      expect(map.layers.get(FILL_LAYER)?.paint['fill-opacity']).toBeCloseTo(0.05, 10)
      expect(map.layers.get(LINE_LAYER)?.paint['line-opacity']).toBeCloseTo(0.375, 10)
    })
  })

  describe('the geometry it builds', () => {
    it('draws the coverage as one flat union so overlaps never darken', () => {
      const markers = [makeMarker(), makeMarker({ id: 'beta', position: [-46.5, -23.4] })]
      makeLayer().render(markers, makeSettings(), 1)
      const coverage = featuresWithRole('coverage')
      expect(coverage).toHaveLength(1)
      expect(coverage[0].geometry.type).toBe('MultiPolygon')
      expect(coverage[0].geometry.coordinates).toHaveLength(2)
    })

    it('outlines every marker at the influence radius in its own color', () => {
      makeLayer().render([makeMarker({ color: '#22c55e' })], makeSettings({ radiusMeters: 800 }), 1)
      const outlines = featuresWithRole('outline')
      expect(outlines).toHaveLength(1)
      expect(outlines[0].properties.color).toBe('#22c55e')
      expect(outlines[0].geometry.coordinates).toEqual([geodesicCircle([-46.6, -23.5], 800)])
    })

    it('rings every marker at the ideal neighbor spacing when the guide is on', () => {
      makeLayer().render([makeMarker()], makeSettings({ showSpacingGuide: true }), 1)
      const guides = featuresWithRole('guide')
      expect(guides).toHaveLength(1)
      expect(guides[0].geometry.coordinates).toEqual([
        geodesicCircle([-46.6, -23.5], 500 * OPTIMAL_SPACING_FACTOR),
      ])
    })

    it('keeps the guide when the influence area itself is hidden', () => {
      makeLayer().render([makeMarker()], makeSettings({ showInfluence: false, showSpacingGuide: true }), 1)
      expect(featuresWithRole('coverage')).toHaveLength(0)
      expect(featuresWithRole('outline')).toHaveLength(0)
      expect(featuresWithRole('guide')).toHaveLength(1)
    })

    it('draws nothing while both toggles are off', () => {
      makeLayer().render([makeMarker()], makeSettings({ showInfluence: false, showSpacingGuide: false }), 1)
      expect(drawnData().features).toHaveLength(0)
    })

    it('draws nothing when there are no markers', () => {
      makeLayer().render([], makeSettings({ showSpacingGuide: true }), 1)
      expect(drawnData().features).toHaveLength(0)
    })

    it('follows the markers as they move', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], makeSettings(), 1)
      layer.render([makeMarker({ position: [10, 20] })], makeSettings(), 1)
      expect(featuresWithRole('outline')[0].geometry.coordinates).toEqual([geodesicCircle([10, 20], 500)])
    })
  })

  describe('fading with the panel', () => {
    it('keeps every layer at full weight while the panel is open', () => {
      makeLayer().render([makeMarker()], makeSettings({ showSpacingGuide: true }), 1)
      expect(map.layers.get(FILL_LAYER)?.paint['fill-opacity']).toBeCloseTo(0.1, 10)
      expect(map.layers.get(LINE_LAYER)?.paint['line-opacity']).toBeCloseTo(0.75, 10)
      expect(map.layers.get(GUIDE_LAYER)?.paint['line-opacity']).toBeCloseTo(0.55, 10)
    })

    it('scales every layer opacity by the requested overlay opacity', () => {
      makeLayer().render([makeMarker()], makeSettings({ showSpacingGuide: true }), 0.5)
      expect(map.layers.get(FILL_LAYER)?.paint['fill-opacity']).toBeCloseTo(0.05, 10)
      expect(map.layers.get(LINE_LAYER)?.paint['line-opacity']).toBeCloseTo(0.375, 10)
      expect(map.layers.get(GUIDE_LAYER)?.paint['line-opacity']).toBeCloseTo(0.275, 10)
    })
  })

  // A first draw can land before the style is ready, and the map fires no event
  // while it sits idle, so the layer has to keep asking.
  describe('drawing before the style is ready', () => {
    it('holds off while the style is still loading', () => {
      map.styleLoaded = false
      makeLayer().render([makeMarker()], makeSettings(), 1)
      expect(map.addSource).not.toHaveBeenCalled()
    })

    it('draws as soon as the style becomes ready', () => {
      map.styleLoaded = false
      makeLayer().render([makeMarker()], makeSettings(), 1)
      vi.advanceTimersByTime(RETRY_DELAY_MS)
      expect(map.addSource).not.toHaveBeenCalled()
      map.styleLoaded = true
      vi.advanceTimersByTime(RETRY_DELAY_MS)
      expect(map.addSource).toHaveBeenCalledTimes(1)
      expect(map.layers.has(FILL_LAYER)).toBe(true)
    })

    it('retries when the style rejects the source it adds', () => {
      map.addSourceFailures = 1
      makeLayer().render([makeMarker()], makeSettings(), 1)
      expect(map.sources.has(SOURCE_ID)).toBe(false)
      vi.advanceTimersByTime(RETRY_DELAY_MS)
      expect(map.addSource).toHaveBeenCalledTimes(2)
      expect(map.sources.has(SOURCE_ID)).toBe(true)
    })

    it('gives up rather than retrying forever', () => {
      map.styleLoaded = false
      makeLayer().render([makeMarker()], makeSettings(), 1)
      vi.advanceTimersByTime(RETRY_DELAY_MS * (MAX_RETRIES + 10))
      expect(map.isStyleLoaded).toHaveBeenCalledTimes(MAX_RETRIES + 1)
      map.styleLoaded = true
      vi.advanceTimersByTime(RETRY_DELAY_MS * 10)
      expect(map.addSource).not.toHaveBeenCalled()
    })

    it('starts the retries over on the next render', () => {
      map.styleLoaded = false
      const layer = makeLayer()
      layer.render([makeMarker()], makeSettings(), 1)
      vi.advanceTimersByTime(RETRY_DELAY_MS * (MAX_RETRIES + 10))
      map.isStyleLoaded.mockClear()
      layer.render([makeMarker()], makeSettings(), 1)
      vi.advanceTimersByTime(RETRY_DELAY_MS)
      expect(map.isStyleLoaded).toHaveBeenCalledTimes(2)
    })
  })

  describe('clearing', () => {
    it('empties the source it drew into', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], makeSettings(), 1)
      layer.clear()
      expect(drawnData().features).toHaveLength(0)
    })

    it('is a no-op before anything has been drawn', () => {
      expect(() => makeLayer().clear()).not.toThrow()
    })

    it('is a no-op while the game has no map', () => {
      currentMap = null
      expect(() => makeLayer().clear()).not.toThrow()
    })

    it('survives a map whose style is gone', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], makeSettings(), 1)
      map.breakGetSource = true
      expect(() => layer.clear()).not.toThrow()
    })
  })
})
