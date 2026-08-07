import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MarkerRoute } from '@/domain/route/MarkerRoute'

import { stationPath } from '@/domain/route/StationPath'
import { RouteLineLayer } from '@/infrastructure/map/RouteLineLayer'

import type { FakeGlMap } from './fakeGlMap'

import { createFakeGlMap } from './fakeGlMap'

const SOURCE_ID = 'sbmm-route'
const CASING_LAYER = 'sbmm-route-casing'
const LINE_LAYER = 'sbmm-route-line'
const PLATFORM_LAYER = 'sbmm-route-platform'
const PLATFORM_CASING_LAYER = 'sbmm-route-platform-casing'
const RETRY_DELAY_MS = 120
const MAX_RETRIES = 25

interface Feature {
  geometry: { coordinates: number[][], type: string }
  properties: { color: string, groupId: string, role: string }
  type: string
}

interface FeatureCollection {
  features: Feature[]
  type: string
}

function makeRoute(overrides: Partial<MarkerRoute> = {}): MarkerRoute {
  return {
    color: '#ef4444',
    groupId: 'line-1',
    points: [[-46.6, -23.5], [-46.5, -23.45], [-46.4, -23.5]],
    ...overrides,
  }
}

describe('RouteLineLayer', () => {
  let currentMap: FakeGlMap | null
  let map: FakeGlMap

  function drawnData(): FeatureCollection {
    return map.sourceData(SOURCE_ID) as FeatureCollection
  }

  function featuresWithRole(role: string): Feature[] {
    return drawnData().features.filter((feature) => feature.properties.role === role)
  }

  function makeLayer(dark = true): RouteLineLayer {
    return new RouteLineLayer(() => currentMap, () => dark)
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
      expect(() => makeLayer().render([makeRoute()], 1)).not.toThrow()
      expect(map.addSource).not.toHaveBeenCalled()
    })

    it('adds one geojson source for every route it draws', () => {
      makeLayer().render([makeRoute()], 1)
      expect(map.addSource).toHaveBeenCalledTimes(1)
      expect(map.addSource).toHaveBeenCalledWith(SOURCE_ID, expect.objectContaining({ type: 'geojson' }))
    })

    it('adds a casing and a colored line layer', () => {
      makeLayer().render([makeRoute()], 1)
      expect(map.layers.get(CASING_LAYER)?.type).toBe('line')
      expect(map.layers.get(LINE_LAYER)?.type).toBe('line')
    })

    // The colored line has to read on top of its own dark casing.
    it('puts the casing underneath the colored line', () => {
      makeLayer().render([makeRoute()], 1)
      expect(map.layerOrder.indexOf(CASING_LAYER)).toBeLessThan(map.layerOrder.indexOf(LINE_LAYER))
    })

    it('draws each route in its own color through a data-driven paint', () => {
      makeLayer().render([makeRoute()], 1)
      expect(map.layers.get(LINE_LAYER)?.paint['line-color']).toEqual(['get', 'color'])
    })

    // Rounded joins keep the curve reading as one line rather than as a chain of
    // segments. The caps stay square: a dashed line would round every dash.
    it('rounds the joins of the curve', () => {
      makeLayer().render([makeRoute()], 1)
      for (const id of [CASING_LAYER, LINE_LAYER]) {
        expect(map.layers.get(id)?.layout).toEqual({ 'line-join': 'round' })
      }
    })

    // Dashed, so the guide never reads as a line that was already built.
    it('dashes both layers', () => {
      makeLayer().render([makeRoute()], 1)
      for (const id of [CASING_LAYER, LINE_LAYER]) {
        const dash = map.layers.get(id)?.paint['line-dasharray'] as number[]
        expect(dash).toHaveLength(2)
        expect(dash[0]).toBeGreaterThan(0)
        expect(dash[1]).toBeGreaterThan(0)
      }
    })

    // `line-dasharray` is in multiples of the line width, so the wider casing needs
    // its own numbers to dash in step with the colored line on top of it.
    // The casing is an outline: it has to stick out past the colored line on every
    // side, so its dashes are both wider and longer, and one dash period still matches
    // so the two stay in step.
    it('wraps each dash of the line in its casing', () => {
      makeLayer().render([makeRoute()], 1)
      const inPixels = (layerId: string): number[] => {
        const paint = map.layers.get(layerId)?.paint ?? {}

        return (paint['line-dasharray'] as number[]).map((part) => part * (paint['line-width'] as number))
      }
      const casing = inPixels(CASING_LAYER)
      const line = inPixels(LINE_LAYER)
      expect(map.layers.get(CASING_LAYER)?.paint['line-width'])
        .toBeGreaterThan(map.layers.get(LINE_LAYER)?.paint['line-width'] as number)
      expect(casing[0]).toBeGreaterThan(line[0])
      expect(casing[0] + casing[1]).toBeCloseTo(line[0] + line[1], 10)
    })

    // Which way the outline contrasts depends on the map under it, not on the line
    // color — a dark outline on a dark map would be no outline at all.
    it('outlines against the theme the game is showing', () => {
      makeLayer(true).render([makeRoute()], 1)
      const onDark = map.layers.get(CASING_LAYER)?.paint['line-color']
      map = createFakeGlMap()
      currentMap = map
      makeLayer(false).render([makeRoute()], 1)
      expect(map.layers.get(CASING_LAYER)?.paint['line-color']).not.toBe(onDark)
    })

    it('re-colours an existing casing when the theme changes', () => {
      const dark = makeLayer(true)
      dark.render([makeRoute()], 1)
      const onDark = map.layers.get(CASING_LAYER)?.paint['line-color']
      new RouteLineLayer(() => currentMap, () => false).render([makeRoute()], 1)
      expect(map.layers.get(CASING_LAYER)?.paint['line-color']).not.toBe(onDark)
    })

    it('outlines the platforms too, solid rather than dashed', () => {
      makeLayer().render([makeRoute()], 1)
      expect(map.layers.get(PLATFORM_CASING_LAYER)?.paint['line-dasharray']).toBeUndefined()
      expect(map.layers.get(PLATFORM_CASING_LAYER)?.paint['line-width'])
        .toBeGreaterThan(map.layers.get(PLATFORM_LAYER)?.paint['line-width'] as number)
    })

    it('updates the existing source instead of adding it twice', () => {
      const layer = makeLayer()
      layer.render([makeRoute()], 1)
      layer.render([makeRoute(), makeRoute({ groupId: 'line-2' })], 1)
      expect(map.addSource).toHaveBeenCalledTimes(1)
      expect(map.sources.get(SOURCE_ID)?.setData).toHaveBeenCalledTimes(1)
      expect(featuresWithRole('line')).toHaveLength(2)
    })

    it('leaves the layers alone when they already exist', () => {
      const layer = makeLayer()
      layer.render([makeRoute()], 1)
      map.addLayer.mockClear()
      layer.render([makeRoute()], 1)
      expect(map.addLayer).not.toHaveBeenCalled()
    })

    // A re-injected build (or a tweaked constant) has to reach a layer the previous
    // run already created, rather than being silently ignored.
    it('re-applies the paint to layers that already exist', () => {
      const layer = makeLayer()
      layer.render([makeRoute()], 1)
      map.setPaintProperty.mockClear()
      layer.render([makeRoute()], 0.5)
      expect(map.layers.get(CASING_LAYER)?.paint['line-opacity']).toBeCloseTo(0.225, 10)
      expect(map.layers.get(LINE_LAYER)?.paint['line-opacity']).toBeCloseTo(0.45, 10)
      expect(map.setPaintProperty).toHaveBeenCalledWith(LINE_LAYER, 'line-dasharray', expect.any(Array))
    })
  })

  describe('the geometry it builds', () => {
    it('draws one line feature per route, tagged with its folder', () => {
      makeLayer().render([makeRoute(), makeRoute({ color: '#22c55e', groupId: 'line-2' })], 1)
      const lines = featuresWithRole('line')
      expect(lines.map((feature) => feature.properties.groupId)).toEqual(['line-1', 'line-2'])
      expect(lines.map((feature) => feature.properties.color)).toEqual(['#ef4444', '#22c55e'])
      expect(lines[0].geometry.type).toBe('LineString')
    })

    // A station is a stretch of straight track, not a point, so each one is drawn.
    it('draws a platform per station, in the route s own color', () => {
      const route = makeRoute()
      makeLayer().render([route], 1)
      const platforms = featuresWithRole('platform')
      expect(platforms).toHaveLength(route.points.length)
      expect(platforms.every((feature) => feature.geometry.coordinates.length === 2)).toBe(true)
      expect(platforms.every((feature) => feature.properties.color === route.color)).toBe(true)
      expect(platforms.every((feature) => feature.properties.groupId === route.groupId)).toBe(true)
    })

    // The renderer joins vertices with straight segments, so the curve has to be in
    // the geometry: the drawn line carries far more points than the route's markers.
    it('draws the platforms and the curve between them, not the bare polyline', () => {
      const route = makeRoute()
      makeLayer().render([route], 1)
      const drawn = featuresWithRole('line')[0].geometry.coordinates
      expect(drawn).toEqual(stationPath(route.points).path)
      expect(drawn.length).toBeGreaterThan(route.points.length)
    })

    it('follows the markers as they move', () => {
      const layer = makeLayer()
      layer.render([makeRoute()], 1)
      const moved = makeRoute({ points: [[10, 20], [11, 21], [12, 20]] })
      layer.render([moved], 1)
      expect(featuresWithRole('line')[0].geometry.coordinates).toEqual(stationPath(moved.points).path)
    })

    // How the setting turning off — or every folder being hidden — reaches the map.
    it('clears the lines but keeps the layers when there is nothing to draw', () => {
      const layer = makeLayer()
      layer.render([makeRoute()], 1)
      layer.render([], 1)
      expect(drawnData().features).toHaveLength(0)
      expect(map.layers.has(LINE_LAYER)).toBe(true)
    })

    it('draws nothing at all when it starts with no routes', () => {
      makeLayer().render([], 1)
      expect(drawnData().features).toHaveLength(0)
    })
  })

  describe('fading with the panel', () => {
    it('keeps every layer at full weight while the panel is open', () => {
      makeLayer().render([makeRoute()], 1)
      expect(map.layers.get(CASING_LAYER)?.paint['line-opacity']).toBeCloseTo(0.45, 10)
      expect(map.layers.get(LINE_LAYER)?.paint['line-opacity']).toBeCloseTo(0.9, 10)
      expect(map.layers.get(PLATFORM_LAYER)?.paint['line-opacity']).toBeCloseTo(0.95, 10)
    })

    it('scales every layer opacity by the requested overlay opacity', () => {
      makeLayer().render([makeRoute()], 0.5)
      expect(map.layers.get(CASING_LAYER)?.paint['line-opacity']).toBeCloseTo(0.225, 10)
      expect(map.layers.get(LINE_LAYER)?.paint['line-opacity']).toBeCloseTo(0.45, 10)
      expect(map.layers.get(PLATFORM_LAYER)?.paint['line-opacity']).toBeCloseTo(0.475, 10)
    })
  })

  // A first draw can land before the style is ready, and the map fires no event while
  // it sits idle, so the layer has to keep asking.
  describe('drawing before the style is ready', () => {
    it('holds off while the style is still loading', () => {
      map.styleLoaded = false
      makeLayer().render([makeRoute()], 1)
      expect(map.addSource).not.toHaveBeenCalled()
    })

    it('draws as soon as the style becomes ready', () => {
      map.styleLoaded = false
      makeLayer().render([makeRoute()], 1)
      vi.advanceTimersByTime(RETRY_DELAY_MS)
      expect(map.addSource).not.toHaveBeenCalled()
      map.styleLoaded = true
      vi.advanceTimersByTime(RETRY_DELAY_MS)
      expect(map.addSource).toHaveBeenCalledTimes(1)
      expect(map.layers.has(LINE_LAYER)).toBe(true)
    })

    it('retries when the style rejects the source it adds', () => {
      map.addSourceFailures = 1
      makeLayer().render([makeRoute()], 1)
      expect(map.sources.has(SOURCE_ID)).toBe(false)
      vi.advanceTimersByTime(RETRY_DELAY_MS)
      expect(map.addSource).toHaveBeenCalledTimes(2)
      expect(map.sources.has(SOURCE_ID)).toBe(true)
    })

    it('gives up rather than retrying forever', () => {
      map.styleLoaded = false
      makeLayer().render([makeRoute()], 1)
      vi.advanceTimersByTime(RETRY_DELAY_MS * (MAX_RETRIES + 10))
      expect(map.isStyleLoaded).toHaveBeenCalledTimes(MAX_RETRIES + 1)
      map.styleLoaded = true
      vi.advanceTimersByTime(RETRY_DELAY_MS * 10)
      expect(map.addSource).not.toHaveBeenCalled()
    })

    it('starts the retries over on the next render', () => {
      map.styleLoaded = false
      const layer = makeLayer()
      layer.render([makeRoute()], 1)
      vi.advanceTimersByTime(RETRY_DELAY_MS * (MAX_RETRIES + 10))
      map.isStyleLoaded.mockClear()
      layer.render([makeRoute()], 1)
      map.styleLoaded = true
      vi.advanceTimersByTime(RETRY_DELAY_MS)
      expect(map.addSource).toHaveBeenCalledTimes(1)
    })
  })

  // The game can hand back a different map instance after a city load, and the layers
  // of the old one are gone with it.
  describe('after a city load', () => {
    it('redraws onto the map instance it is handed next', () => {
      const layer = makeLayer()
      layer.render([makeRoute()], 1)
      const replacement = createFakeGlMap()
      currentMap = replacement
      layer.render([makeRoute()], 1)
      expect(replacement.sources.has(SOURCE_ID)).toBe(true)
      expect(replacement.layers.has(LINE_LAYER)).toBe(true)
    })
  })
})
