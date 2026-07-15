import { describe, expect, it } from 'vitest'

import { geodesicCircle } from '@/domain/marker/GeodesicCircle'

// Metres between two lng/lat points, independent of the implementation under test.
function haversineMeters(a: [number, number], b: [number, number]): number {
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180
  const earthRadius = 6371008.8
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

describe('geodesicCircle', () => {
  it('closes the ring', () => {
    const ring = geodesicCircle([-46.6, -23.5], 500)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })

  it('puts every point the requested distance from the center', () => {
    const center: [number, number] = [-46.633, -23.55]
    const ring = geodesicCircle(center, 1000)
    const distances = ring.map((point) => haversineMeters(center, point))
    for (const distance of distances) {
      expect(distance).toBeGreaterThan(995)
      expect(distance).toBeLessThan(1005)
    }
  })

  // The whole reason this exists instead of a GL circle layer: a fixed ground
  // radius has to survive latitudes where a degree of longitude shrinks.
  it('holds the ground radius at high latitude', () => {
    const center: [number, number] = [18.07, 59.33] // Stockholm
    const ring = geodesicCircle(center, 750)
    for (const point of ring) {
      expect(haversineMeters(center, point)).toBeCloseTo(750, -1)
    }
  })

  it('scales with the requested radius', () => {
    const center: [number, number] = [0, 0]
    const small = geodesicCircle(center, 100)
    const large = geodesicCircle(center, 2000)
    expect(haversineMeters(center, small[0])).toBeLessThan(haversineMeters(center, large[0]))
  })
})
