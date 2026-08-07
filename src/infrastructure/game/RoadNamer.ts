import type { RoadSegment } from '@/domain/naming/RoadStationName'
import type { Coordinate } from '@/shared/game/Coordinate'
import type { StoreCallbacks } from '@/shared/game/StoreCallbacks'

import { stationNameFromRoads } from '@/domain/naming/RoadStationName'

// An entry of the game's road index (an RBush of bounding boxes). Only the parts this
// reads are typed; `type` distinguishes a plain road from a bridge or a tunnel, and the
// game names stations after roads only.
interface IndexedRoad {
  feature?: {
    geometry?: { coordinates?: unknown, type?: string }
    properties?: { name?: unknown }
  }
  type?: string
}

interface RoadIndex {
  search(box: { maxX: number, maxY: number, minX: number, minY: number }): IndexedRoad[]
}

// Names a new marker the way the game names a station it builds there: off the roads
// around it, out of the game's own `roadsIndex`. Everything is optional — a game with
// no road index (or a state we can't read) simply yields no name, and the caller falls
// back to its own numbering.
export class RoadNamer {
  constructor(private readonly storeCallbacks: null | StoreCallbacks) {}

  // `alongBearing` is the direction the line runs at that point, which is what makes
  // the cross street win; null where the marker is on no line.
  nameFor(position: Coordinate, alongBearing: null | number = null): null | string {
    const index = this.index()
    if (!index) {
      return null
    }

    return stationNameFromRoads(position, alongBearing, (radius) => this.roadsWithin(index, position, radius))
  }

  private index(): null | RoadIndex {
    try {
      const state = this.storeCallbacks?.getState?.() as undefined | { roadsIndex?: RoadIndex }
      const index = state?.roadsIndex

      return typeof index?.search === 'function' ? index : null
    } catch {
      return null
    }
  }

  private roadsWithin(index: RoadIndex, [lng, lat]: Coordinate, radius: number): RoadSegment[] {
    let found: IndexedRoad[]
    try {
      found = index.search({ maxX: lng + radius, maxY: lat + radius, minX: lng - radius, minY: lat - radius })
    } catch {
      return []
    }

    return found
      .filter((road) => road.type === 'road' && road.feature?.geometry?.type === 'LineString')
      .map((road) => ({
        coordinates: (road.feature?.geometry?.coordinates ?? []) as Coordinate[],
        name: typeof road.feature?.properties?.name === 'string' ? road.feature.properties.name : '',
      }))
      .filter((road) => road.name !== '')
  }
}
