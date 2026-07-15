import type { Mock } from 'vitest'

import { vi } from 'vitest'

import type { GlMap, LngLat, LngLatLike, MapMouseEvent, Point } from '../../../src/shared/game/GlMap'

// Pixels per degree. The default keeps the numbers in a test readable (a marker at
// lng 1 sits at x 100), but makes one pixel worth a kilometre on the ground — so a
// test about metres (the spacing snap) passes a finer scale instead.
const DEFAULT_SCALE = 100

// The map's own container is offset from the viewport, so a test can tell a client
// coordinate apart from the map-relative one a drag has to convert it into.
export const MAP_RECT_LEFT = 20
export const MAP_RECT_TOP = 10

type MapListener = (event: MapMouseEvent) => void

export interface RecordedLayer {
  id: string
  type: string
  source: string
  filter?: unknown
  layout?: Record<string, unknown>
  paint: Record<string, unknown>
}

export interface FakeSource {
  data: unknown
  setData: Mock<(data: unknown) => void>
}

export interface FakeGlMap extends GlMap {
  addLayer: Mock<(layer: unknown, beforeId?: string) => void>
  addSource: Mock<(id: string, source: unknown) => void>
  dragPan: { disable: Mock<() => void>, enable: Mock<() => void> }
  easeTo: Mock<(options: { center: LngLatLike, duration?: number, zoom?: number }) => void>
  getCanvasContainer: Mock<() => HTMLElement>
  isStyleLoaded: Mock<() => boolean>
  off: Mock<(type: string, listener: MapListener) => void>
  on: Mock<(type: string, listener: MapListener) => void>
  once: Mock<(type: string, listener: MapListener) => void>
  project: Mock<(lngLat: LngLatLike) => Point>
  setFilter: Mock<(layerId: string, filter: unknown) => void>
  setPaintProperty: Mock<(layerId: string, name: string, value: unknown) => void>
  unproject: Mock<(point: [number, number]) => LngLat>

  canvasContainer: HTMLElement
  mapContainer: HTMLElement
  layerOrder: string[]
  layers: Map<string, RecordedLayer>
  sources: Map<string, FakeSource>

  // Knobs for the failure modes the real map has: a style that is not ready yet, a
  // map instance whose canvas is already gone.
  addSourceFailures: number
  breakCanvasContainer: boolean
  breakGetSource: boolean
  styleLoaded: boolean

  emit(type: string, event?: MapMouseEvent): void
  listenerCount(type: string): number
  pan(deltaX: number, deltaY: number): void
  sourceData(id: string): unknown
}

// A stand-in for the Mapbox/MapLibre GL instance the game hands out
// (api.utils.getMap()), implementing only the surface typed in GlMap. Its
// projection is a plain invertible linear mapping, so a test can assert a badge's
// pixels from a lng/lat and read a drop's lng/lat back out of the pixels.
export function createFakeGlMap(options: { scale?: number } = {}): FakeGlMap {
  const scale = options.scale ?? DEFAULT_SCALE
  const listeners = new Map<string, Set<MapListener>>()
  const onceListeners = new Map<string, Set<MapListener>>()
  const offset = { x: 0, y: 0 }

  const mapContainer = document.createElement('div')
  const canvasContainer = document.createElement('div')
  mapContainer.appendChild(canvasContainer)
  document.body.appendChild(mapContainer)
  mapContainer.getBoundingClientRect = (): DOMRect => ({
    x: MAP_RECT_LEFT,
    y: MAP_RECT_TOP,
    left: MAP_RECT_LEFT,
    top: MAP_RECT_TOP,
    right: MAP_RECT_LEFT + 800,
    bottom: MAP_RECT_TOP + 600,
    width: 800,
    height: 600,
    toJSON: () => ({}),
  })

  const register = (registry: Map<string, Set<MapListener>>, type: string, listener: MapListener): void => {
    const set = registry.get(type) ?? new Set<MapListener>()
    set.add(listener)
    registry.set(type, set)
  }

  const map: FakeGlMap = {
    addSourceFailures: 0,
    breakCanvasContainer: false,
    breakGetSource: false,
    styleLoaded: true,

    canvasContainer,
    mapContainer,
    layerOrder: [],
    layers: new Map(),
    sources: new Map(),

    dragPan: { disable: vi.fn(), enable: vi.fn() },
    easeTo: vi.fn(),

    getCenter: (): LngLat => ({ lng: 0, lat: 0 }),
    getContainer: (): HTMLElement => mapContainer,
    getCanvasContainer: vi.fn((): HTMLElement => {
      if (map.breakCanvasContainer) {
        throw new Error('the map has no canvas container')
      }
      return canvasContainer
    }),

    isStyleLoaded: vi.fn((): boolean => map.styleLoaded),

    addSource: vi.fn((id: string, source: unknown): void => {
      if (map.addSourceFailures > 0) {
        map.addSourceFailures--
        throw new Error('style is not done loading')
      }
      const entry: FakeSource = {
        data: (source as { data?: unknown }).data,
        setData: vi.fn((data: unknown): void => {
          entry.data = data
        }),
      }
      map.sources.set(id, entry)
    }),

    getSource: (id: string): FakeSource | undefined => {
      if (map.breakGetSource) {
        throw new Error('the style is not loaded')
      }
      return map.sources.get(id)
    },

    addLayer: vi.fn((layer: unknown): void => {
      const spec = layer as RecordedLayer
      map.layers.set(spec.id, { ...spec, paint: { ...spec.paint } })
      map.layerOrder.push(spec.id)
    }),

    getLayer: (id: string): unknown => map.layers.get(id),

    setFilter: vi.fn((layerId: string, filter: unknown): void => {
      const layer = map.layers.get(layerId)
      if (layer) {
        layer.filter = filter
      }
    }),

    setPaintProperty: vi.fn((layerId: string, name: string, value: unknown): void => {
      const layer = map.layers.get(layerId)
      if (layer) {
        layer.paint[name] = value
      }
    }),

    project: vi.fn((lngLat: LngLatLike): Point => {
      const [lng, lat] = Array.isArray(lngLat) ? lngLat : [lngLat.lng, lngLat.lat]
      return { x: lng * scale + offset.x, y: -lat * scale + offset.y }
    }),

    unproject: vi.fn((point: [number, number]): LngLat => ({
      lng: (point[0] - offset.x) / scale,
      lat: (offset.y - point[1]) / scale,
    })),

    on: vi.fn((type: string, listener: MapListener): void => register(listeners, type, listener)),
    once: vi.fn((type: string, listener: MapListener): void => register(onceListeners, type, listener)),
    off: vi.fn((type: string, listener: MapListener): void => {
      listeners.get(type)?.delete(listener)
      onceListeners.get(type)?.delete(listener)
    }),

    emit: (type: string, event: MapMouseEvent = { lngLat: { lng: 0, lat: 0 } }): void => {
      for (const listener of [...listeners.get(type) ?? []]) {
        listener(event)
      }
      const pending = [...onceListeners.get(type) ?? []]
      onceListeners.delete(type)
      for (const listener of pending) {
        listener(event)
      }
    },

    listenerCount: (type: string): number =>
      (listeners.get(type)?.size ?? 0) + (onceListeners.get(type)?.size ?? 0),

    pan: (deltaX: number, deltaY: number): void => {
      offset.x += deltaX
      offset.y += deltaY
    },

    sourceData: (id: string): unknown => map.sources.get(id)?.data,
  }

  return map
}
