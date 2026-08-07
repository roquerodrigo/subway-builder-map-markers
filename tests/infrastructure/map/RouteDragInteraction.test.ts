import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Marker } from '@/domain/marker/Marker'
import type { MarkerRoute } from '@/domain/route/MarkerRoute'

import { RouteDragInteraction } from '@/infrastructure/map/RouteDragInteraction'

import type { FakeGlMap } from './fakeGlMap'

import { createFakeGlMap, MAP_RECT_LEFT, MAP_RECT_TOP } from './fakeGlMap'

const DRAG_SOURCE = 'sbmm-route-drag'
const DRAG_LAYER = 'sbmm-route-drag-line'
// The fake map projects lng/lat by a fixed scale, so a route along the equator gives
// predictable pixels to aim at.
const ROUTE: MarkerRoute = { color: '#ef4444', groupId: 'line-1', points: [[0, 0], [1, 0]] }

function makeMarker(id: string, position: [number, number]): Marker {
  return { color: '#3b82f6', icon: 'station', id, label: id, position }
}

describe('RouteDragInteraction', () => {
  let attached: { groupId: string, markerId: string }[]
  let map: FakeGlMap
  let markers: Marker[]
  let routes: MarkerRoute[]

  function drag(): RouteDragInteraction {
    const interaction = new RouteDragInteraction(() => map, {
      markers: () => markers,
      onAttach: (markerId, groupId) => attached.push({ groupId, markerId }),
      routes: () => routes,
    })
    interaction.setEnabled(true)

    return interaction
  }

  // The pointer is followed on the window, in client coordinates, because the badges
  // are DOM elements that swallow the map's own events.
  function pointerAt(lng: number, lat: number): PointerEvent {
    const point = map.project([lng, lat])

    return new PointerEvent('pointerup', { clientX: MAP_RECT_LEFT + point.x, clientY: MAP_RECT_TOP + point.y })
  }

  function pressOnLine(lng = 0.5, lat = 0): void {
    map.emit('mousedown', { lngLat: { lat, lng } })
  }

  function releaseAt(lng: number, lat: number): void {
    window.dispatchEvent(pointerAt(lng, lat))
  }

  beforeEach(() => {
    attached = []
    map = createFakeGlMap()
    markers = [makeMarker('m1', [0, 0]), makeMarker('m2', [1, 0]), makeMarker('loose', [0.5, 0.5])]
    routes = [ROUTE]
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('picking a line up', () => {
    it('grabs the line the pointer pressed on', () => {
      drag()
      pressOnLine()
      expect(map.dragPan?.disable).toHaveBeenCalled()
    })

    it('leaves the map alone when the press lands nowhere near a line', () => {
      drag()
      map.emit('mousedown', { lngLat: { lat: 0.5, lng: 0.5 } })
      expect(map.dragPan?.disable).not.toHaveBeenCalled()
    })

    it('does not grab anything while the panel is closed', () => {
      const interaction = drag()
      interaction.setEnabled(false)
      pressOnLine()
      expect(map.dragPan?.disable).not.toHaveBeenCalled()
    })
  })

  describe('the rubber band', () => {
    it('draws from where the line was grabbed to the pointer', () => {
      drag()
      pressOnLine()
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientX: MAP_RECT_LEFT + map.project([0.5, 0.5]).x,
        clientY: MAP_RECT_TOP + map.project([0.5, 0.5]).y,
      }))
      const data = map.sourceData(DRAG_SOURCE) as { features: { geometry: { coordinates: number[][] } }[] }
      expect(map.layers.get(DRAG_LAYER)?.type).toBe('line')
      expect(data.features[0].geometry.coordinates[0][0]).toBeCloseTo(0.5, 6)
      expect(data.features[0].geometry.coordinates[1][1]).toBeCloseTo(0.5, 6)
    })

    it('takes the folder s color', () => {
      drag()
      pressOnLine()
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: MAP_RECT_LEFT, clientY: MAP_RECT_TOP }))
      const data = map.sourceData(DRAG_SOURCE) as { features: { properties: { color: string } }[] }
      expect(data.features[0].properties.color).toBe('#ef4444')
    })

    it('clears when the drag ends', () => {
      drag()
      pressOnLine()
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: MAP_RECT_LEFT, clientY: MAP_RECT_TOP }))
      releaseAt(0.5, 0.5)
      const data = map.sourceData(DRAG_SOURCE) as { features: unknown[] }
      expect(data.features).toEqual([])
    })
  })

  describe('dropping the line', () => {
    it('puts the marker it was dropped on onto that line', () => {
      drag()
      pressOnLine()
      releaseAt(0.5, 0.5)
      expect(attached).toEqual([{ groupId: 'line-1', markerId: 'loose' }])
    })

    // Nothing is changed until a marker takes it: the line simply snaps back.
    it('changes nothing when let go over empty map', () => {
      drag()
      pressOnLine()
      releaseAt(0.8, 0.8)
      expect(attached).toEqual([])
    })

    it('ignores a marker the line already stops at', () => {
      drag()
      pressOnLine()
      releaseAt(1, 0)
      expect(attached).toEqual([])
    })

    it('takes the nearest marker when two are close together', () => {
      markers.push(makeMarker('closer', [0.5, 0.502]))
      drag()
      pressOnLine()
      releaseAt(0.5, 0.5015)
      expect(attached).toEqual([{ groupId: 'line-1', markerId: 'closer' }])
    })

    it('hands the map back its pan and cursor', () => {
      drag()
      pressOnLine()
      releaseAt(0.5, 0.5)
      expect(map.dragPan?.enable).toHaveBeenCalled()
      expect(map.canvasContainer.style.cursor).toBe('')
    })

    it('stops listening once the drag is over', () => {
      drag()
      pressOnLine()
      releaseAt(0.5, 0.5)
      attached = []
      releaseAt(0.5, 0.5)
      expect(attached).toEqual([])
    })
  })

  // The game can hand back a different map instance after a city load.
  describe('after a city load', () => {
    it('binds to the map it is handed next', () => {
      const interaction = drag()
      const replacement = createFakeGlMap()
      map = replacement
      interaction.syncToMap()
      pressOnLine()
      expect(replacement.dragPan?.disable).toHaveBeenCalled()
    })
  })
})
