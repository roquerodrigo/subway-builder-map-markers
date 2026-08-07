import type { Coordinate } from '@/shared/game/Coordinate'

import { localPlaneFor, planarDistance } from '@/domain/geo/LocalPlane'

const SAMPLES_PER_SEGMENT = 24
// Centripetal parameterization (alpha = 0.5). The uniform variant (0) overshoots and
// can loop back on itself where two markers sit much closer together than the rest,
// and the chordal one (1) swings wide on the long segments — neither reads as track.
const CENTRIPETAL_ALPHA = 0.5
const MIN_KNOT_SPACING = 1e-9

// A smooth curve through every one of `points`, in order, as a polyline dense enough
// to read as curved on the map (the GL line layer joins vertices with straight
// segments, so the smoothing has to be baked into the geometry).
//
// It's a centripetal Catmull-Rom spline: it passes exactly through each point — a
// marker is a place the track has to reach, not a hint — and its tangents are
// continuous across the joins, so there's no kink at a marker. The ends are given a
// mirrored neighbor, which extends the curve straight out of the first and last
// marker instead of flattening the first and last segments.
//
// Fitting happens on a LocalPlane, so a curve doesn't come out visibly stretched
// east-west: fitting on raw degrees would bend it in the wrong place away from the
// equator.
export function smoothPath(points: Coordinate[], samplesPerSegment = SAMPLES_PER_SEGMENT): Coordinate[] {
  const path = withoutRepeatedPoints(points)
  if (path.length < 3 || samplesPerSegment < 2) {
    return path
  }

  const local = localPlaneFor(path)
  const plane = path.map(local.project)
  const last = plane.length - 1
  const curve: Coordinate[] = []
  for (let index = 0; index < last; index++) {
    const before = plane[index - 1] ?? mirrored(plane[0], plane[1])
    const after = plane[index + 2] ?? mirrored(plane[last], plane[last - 1])
    for (let step = 0; step < samplesPerSegment; step++) {
      curve.push(interpolate(before, plane[index], plane[index + 1], after, step / samplesPerSegment))
    }
  }
  curve.push(plane[last])

  return curve.map(local.toGeographic)
}

// Barry–Goldman's pyramidal form of the spline: three nested interpolations over the
// knots, which keeps the centripetal parameterization explicit instead of hiding it in
// a matrix of precomputed tangents.
function interpolate(before: Coordinate, from: Coordinate, to: Coordinate, after: Coordinate, ratio: number): Coordinate {
  const firstKnot = 0
  const secondKnot = firstKnot + knotSpacing(before, from)
  const thirdKnot = secondKnot + knotSpacing(from, to)
  const fourthKnot = thirdKnot + knotSpacing(to, after)
  const at = secondKnot + (thirdKnot - secondKnot) * ratio

  const a1 = interpolateBetween(before, from, firstKnot, secondKnot, at)
  const a2 = interpolateBetween(from, to, secondKnot, thirdKnot, at)
  const a3 = interpolateBetween(to, after, thirdKnot, fourthKnot, at)
  const b1 = interpolateBetween(a1, a2, firstKnot, thirdKnot, at)
  const b2 = interpolateBetween(a2, a3, secondKnot, fourthKnot, at)

  return interpolateBetween(b1, b2, secondKnot, thirdKnot, at)
}

function interpolateBetween(from: Coordinate, to: Coordinate, fromKnot: number, toKnot: number, at: number): Coordinate {
  const weight = (at - fromKnot) / (toKnot - fromKnot)

  return [from[0] + (to[0] - from[0]) * weight, from[1] + (to[1] - from[1]) * weight]
}

// Never zero: coincident points would collapse a knot interval and divide by it.
function knotSpacing(from: Coordinate, to: Coordinate): number {
  return Math.max(planarDistance(from, to) ** CENTRIPETAL_ALPHA, MIN_KNOT_SPACING)
}

// `point` reflected through `end`: the phantom neighbor an endpoint needs to have a
// tangent at all.
function mirrored(end: Coordinate, point: Coordinate): Coordinate {
  return [2 * end[0] - point[0], 2 * end[1] - point[1]]
}

function withoutRepeatedPoints(points: Coordinate[]): Coordinate[] {
  return points.filter((point, index) => {
    const previous = points[index - 1]

    return !previous || previous[0] !== point[0] || previous[1] !== point[1]
  })
}
