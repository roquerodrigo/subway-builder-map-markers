import { describe, expect, it, vi } from 'vitest'

import type { StoreCallbacks } from '@/shared/game/StoreCallbacks'

import { RoadNamer } from '@/infrastructure/game/RoadNamer'

interface IndexedRoad {
  feature: { geometry: { coordinates: number[][], type: string }, properties: { name?: string } }
  type: string
}

function road(name: string, coordinates: number[][], type = 'road'): IndexedRoad {
  return { feature: { geometry: { coordinates, type: 'LineString' }, properties: { name } }, type }
}

// A stand-in for the game's road index (an RBush): everything it holds is returned,
// which is enough — the search box only narrows what the naming already scores.
function withRoads(roads: unknown[], search = vi.fn(() => roads)): StoreCallbacks {
  return { getState: () => ({ roadsIndex: { search } }) } as unknown as StoreCallbacks
}

const CROSS = [[0.0002, -0.0005], [0.0002, 0.0005]]
const ALONG = [[-0.0005, 0.0001], [0.0005, 0.0001]]

describe('RoadNamer', () => {
  it('names a marker after the roads around it', () => {
    const namer = new RoadNamer(withRoads([road('Main Street', ALONG)]))
    expect(namer.nameFor([0, 0])).toBe('Main St')
  })

  it('prefers the street the line crosses when it knows which way the line runs', () => {
    const namer = new RoadNamer(withRoads([road('Along Avenue', ALONG), road('Cross Street', CROSS)]))
    expect(namer.nameFor([0, 0], 90)).toBe('Cross St')
  })

  it('searches a box around the marker, widening as the naming asks', () => {
    const search = vi.fn(() => [])
    new RoadNamer(withRoads([], search)).nameFor([10, 20])
    expect(search).toHaveBeenCalledWith({ maxX: 10.001, maxY: 20.001, minX: 9.999, minY: 19.999 })
    expect(search.mock.calls.length).toBeGreaterThan(1)
  })

  // The game names stations after roads; a bridge or a tunnel carrying the same name
  // is the same road, and it names nothing on its own.
  it('ignores anything the index holds that is not a road', () => {
    const namer = new RoadNamer(withRoads([road('Bridge Street', ALONG, 'bridge')]))
    expect(namer.nameFor([0, 0])).toBeNull()
  })

  it('ignores an entry with no line to measure', () => {
    const point = { feature: { geometry: { coordinates: [0, 0], type: 'Point' }, properties: { name: 'Somewhere' } }, type: 'road' }
    expect(new RoadNamer(withRoads([point])).nameFor([0, 0])).toBeNull()
  })

  it('ignores a road with no name', () => {
    const nameless = { feature: { geometry: { coordinates: ALONG, type: 'LineString' }, properties: {} }, type: 'road' }
    expect(new RoadNamer(withRoads([nameless])).nameFor([0, 0])).toBeNull()
  })

  describe('a game it cannot read', () => {
    it('has no name to give without the store', () => {
      expect(new RoadNamer(null).nameFor([0, 0])).toBeNull()
    })

    it('has no name to give when the game has no road index', () => {
      const store = { getState: () => ({}) }
      expect(new RoadNamer(store).nameFor([0, 0])).toBeNull()
    })

    it('survives a store that throws', () => {
      const store = { getState: () => {
        throw new Error('gone')
      } } as unknown as StoreCallbacks
      expect(new RoadNamer(store).nameFor([0, 0])).toBeNull()
    })

    it('survives an index that throws', () => {
      const store = withRoads([], vi.fn(() => {
        throw new Error('bad box')
      }))
      expect(new RoadNamer(store).nameFor([0, 0])).toBeNull()
    })
  })
})
