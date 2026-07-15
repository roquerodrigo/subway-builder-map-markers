import type { Coordinate } from '@/shared/game/Coordinate'

const EARTH_RADIUS_METERS = 6378137
const DEGREES = 180 / Math.PI
const RADIANS = Math.PI / 180

// A geodesic circle as a closed polygon ring of [lng, lat] points around `center`.
// Real geography (destination-point formula per bearing), so the ring stays a true
// `radiusMeters` circle at any latitude and scales correctly with the map's zoom —
// unlike a pixel-radius `circle` layer, which would keep one screen size instead of
// one real-world size. Used to draw a marker's influence area on the map.
export function geodesicCircle(center: Coordinate, radiusMeters: number, points = 72): Coordinate[] {
  const [lng, lat] = center
  const latRad = lat * RADIANS
  const lngRad = lng * RADIANS
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS
  const sinLat = Math.sin(latRad)
  const cosLat = Math.cos(latRad)
  const sinDistance = Math.sin(angularDistance)
  const cosDistance = Math.cos(angularDistance)

  const ring: Coordinate[] = []
  for (let step = 0; step <= points; step++) {
    const bearing = (step / points) * 2 * Math.PI
    const sinPointLat = sinLat * cosDistance + cosLat * sinDistance * Math.cos(bearing)
    const pointLat = Math.asin(sinPointLat)
    const pointLng = lngRad + Math.atan2(
      Math.sin(bearing) * sinDistance * cosLat,
      cosDistance - sinLat * sinPointLat,
    )
    ring.push([pointLng * DEGREES, pointLat * DEGREES])
  }
  return ring
}
