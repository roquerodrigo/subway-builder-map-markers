import { describe, expect, it } from 'vitest'

import { snapToSpacing } from '@/domain/marker/SpacingSnap'

const EARTH_RADIUS_METERS = 6371008.8
const CANDIDATE: [number, number] = [-46.633, -23.55]
const TARGET_METERS = 866

// Metres between two lng/lat points, independent of the implementation under test.
function haversineMeters(a: [number, number], b: [number, number]): number {
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}

// A point `east`/`north` metres from `origin`, on the same sphere haversineMeters
// measures. The snap projects onto its own local plane with a rounded
// metres-per-degree constant, so distances here and there agree to ~0.1% — hence
// the metre-scale tolerances below rather than exact equality.
function offsetMeters(origin: [number, number], east: number, north: number): [number, number] {
  const metersPerDegreeLat = (Math.PI * EARTH_RADIUS_METERS) / 180
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((origin[1] * Math.PI) / 180)
  return [origin[0] + east / metersPerDegreeLng, origin[1] + north / metersPerDegreeLat]
}

// `angleDegrees` is measured counter-clockwise from due east.
function neighborAt(distanceMeters: number, angleDegrees: number): [number, number] {
  const radians = (angleDegrees * Math.PI) / 180
  return offsetMeters(
    CANDIDATE,
    distanceMeters * Math.cos(radians),
    distanceMeters * Math.sin(radians),
  )
}

describe('snapToSpacing', () => {
  it('leaves the first marker of a city alone', () => {
    expect(snapToSpacing(CANDIDATE, [], TARGET_METERS)).toEqual(CANDIDATE)
  })

  it('leaves the marker alone when there is no spacing to snap onto', () => {
    const neighbors = [neighborAt(TARGET_METERS, 0)]
    expect(snapToSpacing(CANDIDATE, neighbors, 0)).toEqual(CANDIDATE)
    expect(snapToSpacing(CANDIDATE, neighbors, -500)).toEqual(CANDIDATE)
  })

  it('leaves the marker alone while it is nowhere near a spacing ring', () => {
    const neighbors = [neighborAt(3 * TARGET_METERS, 0)]
    expect(snapToSpacing(CANDIDATE, neighbors, TARGET_METERS)).toEqual(CANDIDATE)
  })

  it('leaves the marker alone while it is deep inside a neighbor spacing', () => {
    const neighbors = [neighborAt(0.4 * TARGET_METERS, 0)]
    expect(snapToSpacing(CANDIDATE, neighbors, TARGET_METERS)).toEqual(CANDIDATE)
  })

  it('grabs the marker only once it is within a tenth of the spacing', () => {
    const inside = neighborAt(1.08 * TARGET_METERS, 0)
    const outside = neighborAt(1.15 * TARGET_METERS, 0)
    expect(snapToSpacing(CANDIDATE, [inside], TARGET_METERS)).not.toEqual(CANDIDATE)
    expect(snapToSpacing(CANDIDATE, [outside], TARGET_METERS)).toEqual(CANDIDATE)
  })

  it('pushes a marker that drifted just inside the spacing back out onto it', () => {
    const neighbor = neighborAt(0.95 * TARGET_METERS, 0)
    const snapped = snapToSpacing(CANDIDATE, [neighbor], TARGET_METERS)
    expect(haversineMeters(snapped, neighbor)).toBeCloseTo(TARGET_METERS, -1)
    expect(snapped[0]).toBeLessThan(CANDIDATE[0])
  })

  it('pulls a marker that drifted just beyond the spacing back in onto it', () => {
    const neighbor = neighborAt(1.06 * TARGET_METERS, 0)
    const snapped = snapToSpacing(CANDIDATE, [neighbor], TARGET_METERS)
    expect(haversineMeters(snapped, neighbor)).toBeCloseTo(TARGET_METERS, -1)
    expect(snapped[0]).toBeGreaterThan(CANDIDATE[0])
    expect(snapped[0]).toBeLessThan(neighbor[0])
  })

  it('snaps along the bearing to the neighbor, moving only the gap to the ring', () => {
    const neighbor = neighborAt(0.95 * TARGET_METERS, 0)
    const snapped = snapToSpacing(CANDIDATE, [neighbor], TARGET_METERS)
    expect(snapped[1]).toBeCloseTo(CANDIDATE[1], 9)
    expect(haversineMeters(snapped, CANDIDATE)).toBeCloseTo(0.05 * TARGET_METERS, -1)
  })

  it('snaps onto whatever spacing it is given', () => {
    const target = 300
    const neighbor = neighborAt(0.95 * target, 0)
    expect(haversineMeters(snapToSpacing(CANDIDATE, [neighbor], target), neighbor))
      .toBeCloseTo(target, -1)
  })

  // A degree of longitude is half a degree of latitude up here: a snap that
  // measured in raw degrees would land visibly short.
  it('holds the spacing at high latitude', () => {
    const stockholm: [number, number] = [18.07, 59.33]
    const neighbor = offsetMeters(stockholm, 0.95 * TARGET_METERS, 0)
    const snapped = snapToSpacing(stockholm, [neighbor], TARGET_METERS)
    expect(haversineMeters(snapped, neighbor)).toBeCloseTo(TARGET_METERS, -1)
  })

  it('lands on the point that is the right distance from two neighbors at once', () => {
    const neighbors = [neighborAt(0.95 * TARGET_METERS, 0), neighborAt(0.95 * TARGET_METERS, 120)]
    const snapped = snapToSpacing(CANDIDATE, neighbors, TARGET_METERS)
    for (const neighbor of neighbors) {
      expect(haversineMeters(snapped, neighbor)).toBeCloseTo(TARGET_METERS, -1)
    }
  })

  // Two rings cross twice; taking the wrong crossing would fling the marker to the
  // far side of the pair instead of settling it where the player dragged it.
  it.each([120, -120])(
    'settles on the crossing nearest the dragged marker (second neighbor at %i degrees)',
    (angleDegrees) => {
      const neighbors = [
        neighborAt(0.95 * TARGET_METERS, 0),
        neighborAt(0.95 * TARGET_METERS, angleDegrees),
      ]
      const snapped = snapToSpacing(CANDIDATE, neighbors, TARGET_METERS)
      expect(haversineMeters(snapped, CANDIDATE)).toBeLessThan(TARGET_METERS / 2)
      for (const neighbor of neighbors) {
        expect(haversineMeters(snapped, neighbor)).toBeCloseTo(TARGET_METERS, -1)
      }
    },
  )

  it('falls back to the best-fitting neighbor when the two spacing rings cannot meet', () => {
    const nearest = neighborAt(1.02 * TARGET_METERS, 0)
    const other = neighborAt(1.09 * TARGET_METERS, 180)
    const snapped = snapToSpacing(CANDIDATE, [other, nearest], TARGET_METERS)
    expect(haversineMeters(snapped, nearest)).toBeCloseTo(TARGET_METERS, -1)
    expect(haversineMeters(snapped, other)).toBeGreaterThan(TARGET_METERS + 50)
  })

  it('falls back to a radial snap when both neighbors sit on the same spot', () => {
    const neighbor = neighborAt(0.95 * TARGET_METERS, 0)
    const snapped = snapToSpacing(CANDIDATE, [neighbor, [...neighbor]], TARGET_METERS)
    expect(haversineMeters(snapped, neighbor)).toBeCloseTo(TARGET_METERS, -1)
    expect(snapped[1]).toBeCloseTo(CANDIDATE[1], 9)
  })

  it('ignores neighbors outside the tolerance when picking the ring', () => {
    const nearest = neighborAt(0.98 * TARGET_METERS, 0)
    const distant = neighborAt(3 * TARGET_METERS, 90)
    const snapped = snapToSpacing(CANDIDATE, [nearest, distant], TARGET_METERS)
    expect(haversineMeters(snapped, nearest)).toBeCloseTo(TARGET_METERS, -1)
    expect(snapped[1]).toBeCloseTo(CANDIDATE[1], 9)
  })

  it('does not move the marker the caller passed in', () => {
    const candidate: [number, number] = [...CANDIDATE]
    snapToSpacing(candidate, [neighborAt(0.95 * TARGET_METERS, 0)], TARGET_METERS)
    expect(candidate).toEqual(CANDIDATE)
  })
})

// Two neighbors sitting in nearly the same direction put their rings' crossing far
// off to the side: the snap used to fling the marker over 1.2 km — further than the
// spacing it was snapping to — from a drop that was only metres off.
describe('snapToSpacing never flings the marker', () => {
  it('keeps a near-collinear pair from throwing the marker across the map', () => {
    const neighbors = [neighborAt(TARGET_METERS * 0.92, 0), neighborAt(TARGET_METERS * 1.08, 0)]
    const snapped = snapToSpacing(CANDIDATE, neighbors, TARGET_METERS)
    expect(haversineMeters(CANDIDATE, snapped)).toBeLessThan(TARGET_METERS * 0.11)
  })

  it('never moves the marker further than the snap tolerance, at any bearing', () => {
    for (let bearing = 0; bearing < 360; bearing += 5) {
      for (const spread of [0, 2, 5, 15, 45, 90, 150]) {
        const neighbors = [
          neighborAt(TARGET_METERS * 0.93, bearing),
          neighborAt(TARGET_METERS * 1.07, bearing + spread),
        ]
        const snapped = snapToSpacing(CANDIDATE, neighbors, TARGET_METERS)
        expect(haversineMeters(CANDIDATE, snapped)).toBeLessThan(TARGET_METERS * 0.12)
      }
    }
  })
})
