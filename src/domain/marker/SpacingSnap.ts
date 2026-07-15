import type { Coordinate } from '@/shared/game/Coordinate'

// How close (as a fraction of the ideal distance) the dragged marker must be to a
// neighbor's spacing ring before it snaps onto it.
const SNAP_TOLERANCE_FRACTION = 0.1
const METERS_PER_DEGREE_LAT = 111320

interface LocalPoint {
  x: number
  y: number
}

// Magnetic snap for marker placement. While dragging, if the marker is near the
// ideal distance (√3·R) from one or more neighbors, pull it exactly onto that
// spacing so the influence areas tile with no gap and no excess overlap. Snapping to
// two neighbors at once lands on the point equidistant from both — the
// hexagonal-lattice vertex that closes the gap in a cluster; snapping to one pulls
// the marker radially onto that neighbor's ring. Geometry runs on a local planar
// projection around the candidate: exact enough at city scale (sub-meter error
// within a couple of km) and far simpler than spherical circle intersection.
export function snapToSpacing(candidate: Coordinate, neighbors: Coordinate[], targetMeters: number): Coordinate {
  if (targetMeters <= 0 || neighbors.length === 0) {
    return candidate
  }
  const [originLng, originLat] = candidate
  const metersPerLng = METERS_PER_DEGREE_LAT * Math.cos((originLat * Math.PI) / 180)
  const toCoordinate = (point: LocalPoint): Coordinate => [
    originLng + point.x / metersPerLng,
    originLat + point.y / METERS_PER_DEGREE_LAT,
  ]

  const tolerance = targetMeters * SNAP_TOLERANCE_FRACTION
  const withinReach = neighbors
    .map((neighbor): LocalPoint => ({
      x: (neighbor[0] - originLng) * metersPerLng,
      y: (neighbor[1] - originLat) * METERS_PER_DEGREE_LAT,
    }))
    .map((point) => ({ delta: Math.abs(Math.hypot(point.x, point.y) - targetMeters), point }))
    .filter((entry) => entry.delta <= tolerance)
    .sort((a, b) => a.delta - b.delta)

  if (withinReach.length === 0) {
    return candidate
  }
  if (withinReach.length >= 2) {
    const vertex = latticeVertex(withinReach[0].point, withinReach[1].point, targetMeters)
    // Two rings meet at a point that can sit nowhere near where the marker was
    // dropped: when the neighbors nearly line up, their rings cross off to the side,
    // and the "snap" would fling the marker further than the spacing itself. A
    // magnet may only ever tidy up a near-miss, so a vertex beyond the tolerance is
    // rejected in favour of the single-ring pull, which can't move further than that.
    if (vertex && Math.hypot(vertex.x, vertex.y) <= tolerance) {
      return toCoordinate(vertex)
    }
  }

  return toCoordinate(radialSnap(withinReach[0].point, targetMeters))
}

// The point at distance `target` from both neighbors, nearest the origin — the
// hexagonal-lattice vertex that ties a cluster together. Null when the two rings
// can't reach each other.
function latticeVertex(a: LocalPoint, b: LocalPoint, target: number): LocalPoint | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const separation = Math.hypot(dx, dy)
  if (separation === 0 || separation > 2 * target) {
    return null
  }
  const half = separation / 2
  const height = Math.sqrt(Math.max(0, target * target - half * half))
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const perpX = -dy / separation
  const perpY = dx / separation
  const option1: LocalPoint = { x: midX + perpX * height, y: midY + perpY * height }
  const option2: LocalPoint = { x: midX - perpX * height, y: midY - perpY * height }

  return Math.hypot(option1.x, option1.y) <= Math.hypot(option2.x, option2.y) ? option1 : option2
}

// Pull the origin (the dragged marker, at 0,0) onto the ring of radius `target`
// around `neighbor`, keeping the current bearing. The caller only ever passes a
// neighbor already within the tolerance of that ring, so the move is small.
function radialSnap(neighbor: LocalPoint, target: number): LocalPoint {
  const scale = 1 - target / Math.hypot(neighbor.x, neighbor.y)

  return { x: neighbor.x * scale, y: neighbor.y * scale }
}
