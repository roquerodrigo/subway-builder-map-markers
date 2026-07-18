import type { Marker } from '@/domain/marker/Marker'
import type { Coordinate } from '@/shared/game/Coordinate'

const EARTH_RADIUS_METERS = 6371008.8

// The label a station at `position` should take from the markers: the nearest named
// marker whose influence area (a circle of `radiusMeters`) covers it. Only markers with
// a non-blank label count, and ties break by distance. Returns null when no named
// marker's area reaches the station, so the caller leaves the game's own name in place.
// `position` and each marker position are [lng, lat] — the same order the game stores a
// station's coords in.
export function stationNameFromMarkers(
  position: Coordinate,
  markers: Marker[],
  radiusMeters: number,
): null | string {
  if (radiusMeters <= 0) {
    return null
  }
  let best: null | { distance: number, label: string } = null
  for (const marker of markers) {
    const label = marker.label.trim()
    if (label.length === 0) {
      continue
    }
    const distance = haversineMeters(position, marker.position)
    if (distance <= radiusMeters && (best === null || distance < best.distance)) {
      best = { distance, label }
    }
  }

  return best === null ? null : best.label
}

// Great-circle distance in meters, matching the geodesic influence circle so "inside
// the area" means the same thing the player sees drawn.
function haversineMeters(a: Coordinate, b: Coordinate): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180
  const deltaLat = toRadians(b[1] - a[1])
  const deltaLng = toRadians(b[0] - a[0])
  const sines =
    Math.sin(deltaLat / 2) ** 2 +
    Math.sin(deltaLng / 2) ** 2 * Math.cos(toRadians(a[1])) * Math.cos(toRadians(b[1]))

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(sines))
}
