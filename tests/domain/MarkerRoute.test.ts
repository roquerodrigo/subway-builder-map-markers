import { describe, expect, it } from 'vitest'

import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'

import { markerRoutes } from '@/domain/route/MarkerRoute'

function makeGroup(overrides: Partial<MarkerGroup> = {}): MarkerGroup {
  return { color: null, hidden: false, id: 'line-1', markerIds: [], name: 'Line 1', ...overrides }
}

function makeMarker(id: string, overrides: Partial<Marker> = {}): Marker {
  return { color: '#ef4444', icon: 'station', id, label: id, position: [0, 0], ...overrides }
}

describe('markerRoutes', () => {
  it('has nothing to draw for an empty board', () => {
    expect(markerRoutes([], [])).toEqual([])
  })

  it('joins the markers of a folder in the order the folder holds them', () => {
    const group = makeGroup({ markerIds: ['a', 'b', 'c'] })
    const markers = [
      makeMarker('c', { position: [3, 3] }),
      makeMarker('a', { position: [1, 1] }),
      makeMarker('b', { position: [2, 2] }),
    ]
    expect(markerRoutes(markers, [group])).toEqual([
      { color: '#ef4444', groupId: 'line-1', points: [[1, 1], [2, 2], [3, 3]] },
    ])
  })

  it('keeps each folder on its own route', () => {
    const groups = [
      makeGroup({ markerIds: ['a', 'c'] }),
      makeGroup({ id: 'line-2', markerIds: ['b', 'd'], name: 'Line 2' }),
    ]
    const markers = [
      makeMarker('a', { position: [1, 1] }),
      makeMarker('b', { position: [5, 5] }),
      makeMarker('c', { position: [2, 2] }),
      makeMarker('d', { position: [6, 6] }),
    ]
    const routes = markerRoutes(markers, groups)
    expect(routes.map((route) => route.groupId)).toEqual(['line-1', 'line-2'])
    expect(routes[0].points).toEqual([[1, 1], [2, 2]])
    expect(routes[1].points).toEqual([[5, 5], [6, 6]])
  })

  it('follows the folder order the panel draws', () => {
    const groups = [
      makeGroup({ id: 'line-2', markerIds: ['c', 'd'] }),
      makeGroup({ id: 'line-1', markerIds: ['a', 'b'] }),
    ]
    const markers = [
      makeMarker('a'),
      makeMarker('b', { position: [1, 1] }),
      makeMarker('c'),
      makeMarker('d', { position: [2, 2] }),
    ]
    expect(markerRoutes(markers, groups).map((route) => route.groupId)).toEqual(['line-2', 'line-1'])
  })

  // A lone marker in a folder is a candidate location, not a line.
  it('skips a folder with fewer than two markers', () => {
    const groups = [makeGroup({ markerIds: ['a'] }), makeGroup({ id: 'empty' })]
    expect(markerRoutes([makeMarker('a')], groups)).toEqual([])
  })

  // Loose markers are candidates the player has not committed to a line yet; joining
  // them would draw a path nobody asked for.
  it('leaves markers no folder holds unconnected', () => {
    expect(markerRoutes([makeMarker('a'), makeMarker('b', { position: [1, 1] })], [])).toEqual([])
  })

  // A folder holding an id whose marker is gone draws the rest of its line rather
  // than a segment jumping over the hole.
  it('skips an id whose marker is gone', () => {
    const group = makeGroup({ markerIds: ['a', 'removed', 'b'] })
    const markers = [makeMarker('a'), makeMarker('b', { position: [1, 1] })]
    expect(markerRoutes(markers, [group])[0].points).toEqual([[0, 0], [1, 1]])
  })

  // An interchange is on every line that stops there, so each of those lines runs
  // through it.
  it('runs every line of an interchange through it', () => {
    const groups = [
      makeGroup({ markerIds: ['shared', 'a'] }),
      makeGroup({ id: 'line-2', markerIds: ['shared', 'b'], name: 'Line 2' }),
    ]
    const markers = [
      makeMarker('shared', { position: [0, 0] }),
      makeMarker('a', { position: [1, 1] }),
      makeMarker('b', { position: [-1, -1] }),
    ]
    const routes = markerRoutes(markers, groups)
    expect(routes[0].points).toEqual([[0, 0], [1, 1]])
    expect(routes[1].points).toEqual([[0, 0], [-1, -1]])
  })

  describe('the color a route takes', () => {
    it('takes the folder color, so the line reads as the line', () => {
      const group = makeGroup({ color: '#22c55e', markerIds: ['a', 'b'] })
      const markers = [
        makeMarker('a', { color: '#ef4444' }),
        makeMarker('b', { color: '#3b82f6', position: [1, 1] }),
      ]
      expect(markerRoutes(markers, [group])[0].color).toBe('#22c55e')
    })

    it('falls back to the first marker color when the folder has none', () => {
      const markers = [
        makeMarker('a', { color: '#3b82f6' }),
        makeMarker('b', { color: '#ef4444', position: [1, 1] }),
      ]
      expect(markerRoutes(markers, [makeGroup({ markerIds: ['a', 'b'] })])[0].color).toBe('#3b82f6')
    })
  })
})
