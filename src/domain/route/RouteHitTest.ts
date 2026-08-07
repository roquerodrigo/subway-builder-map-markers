import type { MarkerRoute } from '@/domain/route/MarkerRoute'
import type { Coordinate } from '@/shared/game/Coordinate'

import { localPlaneFor } from '@/domain/geo/LocalPlane'
import { stationPath } from '@/domain/route/StationPath'

export interface RouteHit {
  // Distance from the point to the line, in the units `within` was given in.
  distance: number
  groupId: string
}

// Which folder's line passes under `point`, if any — the closest one within `within`
// (a distance in degrees of latitude, which is what a LocalPlane measures). Used to
// drop a new marker straight onto the line it was placed on, and to pick up a line by
// dragging it.
//
// Measured against the line as drawn — platforms and curves, not the marker-to-marker
// polyline — so what the player aimed at is what gets hit.
export function routeUnderPoint(routes: MarkerRoute[], point: Coordinate, within: number): null | RouteHit {
  let best: null | RouteHit = null
  for (const route of routes) {
    const drawn = stationPath(route.points).path
    if (drawn.length < 2) {
      continue
    }
    const plane = localPlaneFor([...drawn, point])
    const at = plane.project(point)
    let closest = Infinity
    const projected = drawn.map(plane.project)
    for (let index = 1; index < projected.length; index++) {
      closest = Math.min(closest, distanceToSegment(at, projected[index - 1], projected[index]))
    }
    if (closest <= within && (!best || closest < best.distance)) {
      best = { distance: closest, groupId: route.groupId }
    }
  }

  return best
}

function distanceToSegment(point: Coordinate, from: Coordinate, to: Coordinate): number {
  const alongX = to[0] - from[0]
  const alongY = to[1] - from[1]
  const lengthSquared = alongX * alongX + alongY * alongY
  if (lengthSquared === 0) {
    return Math.hypot(point[0] - from[0], point[1] - from[1])
  }
  const at = Math.min(1, Math.max(0, ((point[0] - from[0]) * alongX + (point[1] - from[1]) * alongY) / lengthSquared))

  return Math.hypot(point[0] - (from[0] + at * alongX), point[1] - (from[1] + at * alongY))
}
