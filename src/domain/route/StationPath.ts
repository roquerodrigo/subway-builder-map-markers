import type { Coordinate } from '@/shared/game/Coordinate'

import { localPlaneFor, planarDistance } from '@/domain/geo/LocalPlane'

// A station is not a point on the line: the game lays a 229 m × 8 m platform, and the
// track runs straight through it. So each marker reserves that much straight line,
// aligned with the direction the line is travelling there, and the curves happen
// between stations — which is what the track has to do too.
export const PLATFORM_LENGTH_METERS = 229
const SAMPLES_PER_SEGMENT = 24
// How far the Hermite tangents reach into a segment. At 1/3 of its length the curve
// leaves each platform along the platform's own direction without bulging past the
// stations on either side.
const TANGENT_REACH = 1 / 3
const METERS_PER_DEGREE_LATITUDE = 111320
const MIN_TANGENT = 1e-12

// The line a folder draws: its platforms, and the path running through them.
export interface StationPath {
  // The whole line end to end: platform, curve, platform, curve… so it can be drawn as
  // a single feature.
  path: Coordinate[]
  // One straight segment per station, in order — the platform the track runs through.
  platforms: Coordinate[][]
}

export interface StationPathOptions {
  platformMeters?: number
  samplesPerSegment?: number
}

// Build the line through `points` (a folder's markers, in order): a straight platform
// at every station, joined by curves that leave and enter each platform along its own
// direction, so there is no kink where a curve meets a station.
//
// Everything is fitted on a LocalPlane — distances and directions on raw lng/lat would
// be stretched east-west away from the equator, tilting every platform.
export function stationPath(points: Coordinate[], options: StationPathOptions = {}): StationPath {
  const path = withoutRepeatedPoints(points)
  const platformMeters = options.platformMeters ?? PLATFORM_LENGTH_METERS
  const samples = Math.max(options.samplesPerSegment ?? SAMPLES_PER_SEGMENT, 1)
  if (path.length === 0) {
    return { path: [], platforms: [] }
  }

  const local = localPlaneFor(path)
  const plane = path.map(local.project)
  const halfPlatform = (platformMeters / 2) / METERS_PER_DEGREE_LATITUDE
  const directions = plane.map((_, index) => directionAt(plane, index))
  const platforms = plane.map((center, index) => reach(center, directions[index], halfPlatform, plane, index))

  const drawn: Coordinate[] = [platforms[0][0], platforms[0][1]]
  for (let index = 0; index + 1 < plane.length; index++) {
    const from = platforms[index][1]
    const to = platforms[index + 1][0]
    const span = planarDistance(from, to) * TANGENT_REACH
    for (let step = 1; step < samples; step++) {
      drawn.push(hermite(from, to, scaled(directions[index], span), scaled(directions[index + 1], span), step / samples))
    }
    drawn.push(to, platforms[index + 1][1])
  }

  return {
    path: drawn.map(local.toGeographic),
    platforms: platforms.map((platform) => platform.map(local.toGeographic)),
  }
}

// The unit direction the line travels at `index`: through its neighbors, so the
// platform lines up with the way the track arrives and leaves. The ends take the
// direction of their only neighbor.
function directionAt(plane: Coordinate[], index: number): Coordinate {
  const before = plane[index - 1] ?? plane[index]
  const after = plane[index + 1] ?? plane[index]

  return normalized([after[0] - before[0], after[1] - before[1]])
}

// A cubic Hermite between two points with the tangents they leave and arrive on.
function hermite(from: Coordinate, to: Coordinate, fromTangent: Coordinate, toTangent: Coordinate, at: number): Coordinate {
  const squared = at * at
  const cubed = squared * at
  const position = 2 * cubed - 3 * squared + 1
  const departure = cubed - 2 * squared + at
  const arrival = -2 * cubed + 3 * squared
  const approach = cubed - squared

  return [
    position * from[0] + departure * fromTangent[0] + arrival * to[0] + approach * toTangent[0],
    position * from[1] + departure * fromTangent[1] + arrival * to[1] + approach * toTangent[1],
  ]
}

function normalized(vector: Coordinate): Coordinate {
  const length = Math.hypot(vector[0], vector[1])

  return length < MIN_TANGENT ? [1, 0] : [vector[0] / length, vector[1] / length]
}

// The platform's two ends. Shortened when a neighbor sits closer than the platform is
// long, so two stations on top of each other can't overlap or turn the line inside out.
function reach(center: Coordinate, direction: Coordinate, half: number, plane: Coordinate[], index: number): Coordinate[] {
  const neighbors = [plane[index - 1], plane[index + 1]].filter((point) => point !== undefined)
  const nearest = neighbors.reduce((closest, point) => Math.min(closest, planarDistance(center, point)), Infinity)
  const length = Math.min(half, nearest / 3)

  return [
    [center[0] - direction[0] * length, center[1] - direction[1] * length],
    [center[0] + direction[0] * length, center[1] + direction[1] * length],
  ]
}

function scaled(vector: Coordinate, by: number): Coordinate {
  return [vector[0] * by, vector[1] * by]
}

function withoutRepeatedPoints(points: Coordinate[]): Coordinate[] {
  return points.filter((point, index) => {
    const previous = points[index - 1]

    return !previous || previous[0] !== point[0] || previous[1] !== point[1]
  })
}
