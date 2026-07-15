import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MarkerSettings } from '@/domain/settings/MarkerSettings'
import type { SettingsRepository } from '@/infrastructure/persistence/SettingsRepository'
import type { SubwayBuilderApi } from '@/shared/game/SubwayBuilderApi'

import { MarkerStore } from '@/application/MarkerStore'
import { SettingsStore } from '@/application/SettingsStore'
import { OPTIMAL_SPACING_FACTOR } from '@/domain/marker/Marker'
import { DEFAULT_SETTINGS } from '@/domain/settings/MarkerSettings'
import { MapMarkersController } from '@/infrastructure/map/MapMarkersController'
import { MarkerRepository } from '@/infrastructure/persistence/MarkerRepository'
import { createModStorage } from '@/infrastructure/persistence/ModStorage'
import { GameSession } from '@/infrastructure/store/GameSession'

import type { FakeGlMap } from './fakeGlMap'

import { createFakeGlMap, MAP_RECT_LEFT, MAP_RECT_TOP } from './fakeGlMap'

function badgeRootsOf(map: FakeGlMap): HTMLElement[] {
  return Array.from(overlayOf(map).children) as HTMLElement[]
}

// Kept in memory so a debounced write can never outlive its test and leak into the
// settings the next one loads.
function createSettingsRepository(initial: MarkerSettings): SettingsRepository {
  let stored = initial

  return {
    load: (): MarkerSettings => stored,
    save: (settings: MarkerSettings): void => {
      stored = settings
    },
  }
}

// Metres between two lng/lat points, independent of the geometry under test.
function haversineMeters(a: [number, number], b: [number, number]): number {
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180
  const earthRadius = 6371008.8
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a[1])) * Math.cos(toRad(b[1]))

  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

function overlayOf(map: FakeGlMap): HTMLElement {
  const overlay = map.canvasContainer.querySelector<HTMLElement>('.sbmm-marker-overlay')
  if (!overlay) {
    throw new Error('the controller drew no overlay')
  }

  return overlay
}

describe('MapMarkersController', () => {
  let api: SubwayBuilderApi
  let controller: MapMarkersController
  let currentMap: FakeGlMap | null
  let map: FakeGlMap
  let settings: SettingsStore
  let store: MarkerStore

  function build(options: { scale?: number, settings?: Partial<MarkerSettings> } = {}): void {
    map = createFakeGlMap({ scale: options.scale })
    currentMap = map
    api = { utils: { getMap: (): unknown => currentMap } }
    store = new MarkerStore(new MarkerRepository(createModStorage()), new GameSession(api, null))
    settings = new SettingsStore(createSettingsRepository({ ...DEFAULT_SETTINGS, ...options.settings }))
    controller = new MapMarkersController(api, store, settings)
  }

  beforeEach(() => {
    build()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('starting up', () => {
    it('draws the markers that are already in the store', () => {
      store.add([1, 2])
      controller.start()
      expect(badgeRootsOf(map)).toHaveLength(1)
      expect(map.layers.has('sbmm-radius-fill')).toBe(true)
    })

    it('redraws when a marker is added', () => {
      controller.start()
      store.add([1, 2])
      expect(badgeRootsOf(map)).toHaveLength(1)
    })

    it('redraws when a display setting changes', () => {
      store.add([1, 2])
      controller.start()
      settings.update({ showLabels: false })
      const label = badgeRootsOf(map)[0].children[1] as HTMLElement
      expect(label.style.display).toBe('none')
    })

    it('redraws onto the new map instance after a city load', () => {
      store.add([1, 2])
      controller.start()
      const replacement = createFakeGlMap()
      currentMap = replacement
      controller.syncToMap()
      expect(badgeRootsOf(replacement)).toHaveLength(1)
      expect(replacement.layers.has('sbmm-radius-fill')).toBe(true)
    })
  })

  describe('placing a marker', () => {
    it('arms a one-shot map click', () => {
      controller.start()
      controller.togglePlacement()
      expect(controller.isPlacing()).toBe(true)
      expect(map.once).toHaveBeenCalledWith('click', expect.any(Function))
      expect(map.listenerCount('click')).toBe(1)
    })

    it('hints the mode with a crosshair over the map', () => {
      controller.start()
      controller.togglePlacement()
      expect(map.canvasContainer.style.cursor).toBe('crosshair')
    })

    it('adds a marker where the map was clicked and selects it', () => {
      controller.start()
      controller.togglePlacement()
      map.emit('click', { lngLat: { lat: 6, lng: 5 } })
      expect(store.all()).toHaveLength(1)
      expect(store.all()[0].position).toEqual([5, 6])
      expect(store.selected()).toBe(store.all()[0].id)
    })

    it('disarms itself once the marker is placed', () => {
      controller.start()
      controller.togglePlacement()
      map.emit('click', { lngLat: { lat: 6, lng: 5 } })
      expect(controller.isPlacing()).toBe(false)
      expect(map.canvasContainer.style.cursor).toBe('')
    })

    it('places only one marker per arming', () => {
      controller.start()
      controller.togglePlacement()
      map.emit('click', { lngLat: { lat: 6, lng: 5 } })
      map.emit('click', { lngLat: { lat: 8, lng: 7 } })
      expect(store.all()).toHaveLength(1)
    })

    it('cancels the arming when toggled again', () => {
      controller.start()
      controller.togglePlacement()
      controller.togglePlacement()
      expect(controller.isPlacing()).toBe(false)
      expect(map.off).toHaveBeenCalledWith('click', expect.any(Function))
      expect(map.listenerCount('click')).toBe(0)
    })

    it('ignores a cancel when nothing is armed', () => {
      controller.start()
      controller.cancelPlacement()
      expect(map.off).not.toHaveBeenCalled()
    })

    it('does not arm when the game has no map', () => {
      currentMap = null
      controller.togglePlacement()
      expect(controller.isPlacing()).toBe(false)
    })

    it('still disarms when the map went away first', () => {
      controller.start()
      controller.togglePlacement()
      currentMap = null
      controller.cancelPlacement()
      expect(controller.isPlacing()).toBe(false)
    })

    it('tolerates a map that cannot hand out its canvas', () => {
      controller.start()
      map.breakCanvasContainer = true
      expect(() => controller.togglePlacement()).not.toThrow()
      expect(controller.isPlacing()).toBe(true)
    })

    it('tells its listeners when the mode turns on and off', () => {
      const listener = vi.fn()
      controller.start()
      controller.onPlacementChange(listener)
      controller.togglePlacement()
      controller.togglePlacement()
      expect(listener.mock.calls).toEqual([[true], [false]])
    })

    it('stops telling a listener that unsubscribed', () => {
      const listener = vi.fn()
      controller.start()
      const unsubscribe = controller.onPlacementChange(listener)
      unsubscribe()
      controller.togglePlacement()
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('focusing a marker', () => {
    it('flies to the marker and selects it', () => {
      controller.start()
      const marker = store.add([1, 2])
      store.select(null)
      controller.focus(marker.id)
      expect(map.easeTo).toHaveBeenCalledWith({ center: [1, 2], duration: 400 })
      expect(store.selected()).toBe(marker.id)
    })

    it('selects even when there is nothing to fly to', () => {
      controller.start()
      controller.focus('not-a-marker')
      expect(map.easeTo).not.toHaveBeenCalled()
      expect(store.selected()).toBe('not-a-marker')
    })

    it('does not fly when the game has no map', () => {
      controller.start()
      const marker = store.add([1, 2])
      currentMap = null
      controller.focus(marker.id)
      expect(map.easeTo).not.toHaveBeenCalled()
      expect(store.selected()).toBe(marker.id)
    })
  })

  describe('following the panel', () => {
    it('makes the badges interactive and fully opaque when the panel opens', () => {
      store.add([1, 2])
      controller.start()
      controller.setPanelOpen(true)
      expect(overlayOf(map).style.zIndex).toBe('10')
      expect(overlayOf(map).style.opacity).toBe('1')
      expect(map.layers.get('sbmm-radius-fill')?.paint['fill-opacity']).toBeCloseTo(0.1, 10)
    })

    it('fades the overlay back to the idle opacity when the panel closes', () => {
      build({ settings: { idleOpacity: 0.4 } })
      store.add([1, 2])
      controller.start()
      controller.setPanelOpen(true)
      controller.setPanelOpen(false)
      expect(overlayOf(map).style.zIndex).toBe('3')
      expect(overlayOf(map).style.opacity).toBe('0.4')
      expect(map.layers.get('sbmm-radius-fill')?.paint['fill-opacity']).toBeCloseTo(0.04, 10)
    })

    it('starts faded, since the panel begins closed', () => {
      build({ settings: { idleOpacity: 0.4 } })
      store.add([1, 2])
      controller.start()
      expect(overlayOf(map).style.opacity).toBe('0.4')
    })

    it('does no work when told what it already knows', () => {
      store.add([1, 2])
      controller.start()
      map.project.mockClear()
      controller.setPanelOpen(false)
      expect(map.project).not.toHaveBeenCalled()
    })
  })

  describe('reacting to the badges', () => {
    let frames: Map<number, FrameRequestCallback>

    beforeEach(() => {
      frames = new Map()
      let nextHandle = 1
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
        const handle = nextHandle++
        frames.set(handle, callback)

        return handle
      })
      vi.stubGlobal('cancelAnimationFrame', (handle: number): void => {
        frames.delete(handle)
      })
    })

    afterEach(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))
      vi.unstubAllGlobals()
    })

    function flushFrames(): void {
      const pending = [...frames.values()]
      frames.clear()
      for (const frame of pending) {
        frame(0)
      }
    }

    function firstBadge(): HTMLElement {
      return badgeRootsOf(map)[0].children[0] as HTMLElement
    }

    it('selects the marker whose badge is clicked', () => {
      store.add([1, 2])
      controller.start()
      controller.setPanelOpen(true)
      store.select(null)
      firstBadge().dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      }))
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))
      expect(store.selected()).toBe(store.all()[0].id)
    })

    // The store is what the panel reads, so it has to follow the drag live rather
    // than waiting for the drop, or the two views would disagree mid-drag.
    it('moves the marker in the store while the badge is still being dragged', () => {
      const marker = store.add([1, 2])
      controller.start()
      controller.setPanelOpen(true)
      firstBadge().dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 120,
        clientY: 10,
        pointerId: 1,
      }))
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 500 + MAP_RECT_LEFT,
        clientY: 300 + MAP_RECT_TOP,
        pointerId: 1,
      }))
      flushFrames()
      expect(store.all()[0].position).toEqual([5, -3])
      expect(store.all()[0].id).toBe(marker.id)
    })
  })

  // Driven through a real drag on the badge, since the snap only exists to shape
  // what the map layer reports back.
  describe('snapping a dragged marker onto the ideal spacing', () => {
    const IDEAL_SPACING_METERS = DEFAULT_SETTINGS.radiusMeters * OPTIMAL_SPACING_FACTOR
    const NEIGHBOR: [number, number] = [0, 0]
    // One pixel is ~11 m at this scale, fine enough to land inside the snap's
    // tolerance band around the ideal spacing.
    const SCALE = 10000
    const DRAGGED_LNG = 0.008

    function dragOntoTheRing(): [number, number] {
      store.add(NEIGHBOR)
      const dragged = store.add([0.01, 0])
      controller.start()
      controller.setPanelOpen(true)
      const badge = badgeRootsOf(map)[1].children[0] as HTMLElement
      badge.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 100 + MAP_RECT_LEFT,
        clientY: MAP_RECT_TOP,
        pointerId: 1,
      }))
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: DRAGGED_LNG * SCALE + MAP_RECT_LEFT,
        clientY: MAP_RECT_TOP,
        pointerId: 1,
      }))
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))
      const marker = store.all().find((candidate) => candidate.id === dragged.id)
      if (!marker) {
        throw new Error('the dragged marker vanished')
      }

      return marker.position
    }

    // Measured to a few metres: the snap works on a local planar projection, so it
    // lands within ~0.1% of what a spherical measure reads back.
    it('pulls the marker onto the ideal distance from its neighbor', () => {
      build({ scale: SCALE, settings: { snapToSpacing: true } })
      const position = dragOntoTheRing()
      expect(haversineMeters(NEIGHBOR, position)).toBeCloseTo(IDEAL_SPACING_METERS, -1)
    })

    it('leaves the marker exactly where it was dropped when snapping is off', () => {
      build({ scale: SCALE, settings: { snapToSpacing: false } })
      const position = dragOntoTheRing()
      expect(position).toEqual([DRAGGED_LNG, 0])
      expect(haversineMeters(NEIGHBOR, position)).not.toBeCloseTo(IDEAL_SPACING_METERS, -1)
    })

    it('selects the marker it just dropped', () => {
      build({ scale: SCALE, settings: { snapToSpacing: true } })
      dragOntoTheRing()
      expect(store.selected()).toBe(store.all()[1].id)
    })
  })
})
