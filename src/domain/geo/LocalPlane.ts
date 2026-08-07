import type { Coordinate } from '@/shared/game/Coordinate'

const RADIANS = Math.PI / 180
// Guards the rescaling at the poles, where the cosine reaches zero and the round trip
// back to geographic coordinates would divide by it.
const MIN_LONGITUDE_SCALE = 1e-6

// A flat plane fitted to one cluster of points, on which x and y measure the same
// distance on the ground: longitude is scaled by the cosine of the mean latitude, so a
// degree east covers the same ground as a degree north. Fitting curves or comparing
// distances on raw lng/lat instead would stretch everything east-west away from the
// equator — at 23°S a degree of longitude is ~0.92 of a degree of latitude.
//
// Only ever used within one board's worth of markers, where a single scale for the
// whole cluster is accurate enough and far cheaper than a per-pair geodesic.
export interface LocalPlane {
  project(point: Coordinate): Coordinate
  toGeographic(point: Coordinate): Coordinate
}

export function localPlaneFor(points: Coordinate[]): LocalPlane {
  const longitudeScale = Math.max(Math.cos(meanLatitude(points) * RADIANS), MIN_LONGITUDE_SCALE)

  return {
    project: ([longitude, latitude]) => [longitude * longitudeScale, latitude],
    toGeographic: ([x, latitude]) => [x / longitudeScale, latitude],
  }
}

// Straight-line distance between two points already on the plane, in degrees of
// latitude. A comparable measure, not a metric one: everything using it is ranking
// distances against each other.
export function planarDistance(from: Coordinate, to: Coordinate): number {
  return Math.hypot(to[0] - from[0], to[1] - from[1])
}

function meanLatitude(points: Coordinate[]): number {
  if (points.length === 0) {
    return 0
  }

  return points.reduce((total, [, latitude]) => total + latitude, 0) / points.length
}
