import { describe, expect, it } from 'vitest'

import type { Coordinate } from '@/shared/game/Coordinate'

import { smoothPath } from '@/domain/route/SmoothPath'

// The heading of a segment, in degrees, on the same local plane the spline is fitted
// on — so a "smooth" assertion isn't fooled by the longitude scaling.
function heading(from: Coordinate, to: Coordinate, latitude: number): number {
  const scale = Math.cos((latitude * Math.PI) / 180)

  return (Math.atan2(to[1] - from[1], (to[0] - from[0]) * scale) * 180) / Math.PI
}

function includesPoint(path: Coordinate[], point: Coordinate): boolean {
  return path.some(([lng, lat]) => Math.abs(lng - point[0]) < 1e-9 && Math.abs(lat - point[1]) < 1e-9)
}

// The largest turn between consecutive segments: how sharp the sharpest corner is.
function sharpestTurnDegrees(path: Coordinate[], latitude = 0): number {
  let sharpest = 0
  for (let index = 1; index < path.length - 1; index++) {
    const incoming = heading(path[index - 1], path[index], latitude)
    const outgoing = heading(path[index], path[index + 1], latitude)
    sharpest = Math.max(sharpest, Math.abs(((outgoing - incoming + 540) % 360) - 180))
  }

  return sharpest
}

describe('smoothPath', () => {
  describe('paths too short to curve', () => {
    it('returns an empty path untouched', () => {
      expect(smoothPath([])).toEqual([])
    })

    it('returns a single point untouched', () => {
      expect(smoothPath([[-46.6, -23.5]])).toEqual([[-46.6, -23.5]])
    })

    // Two markers have exactly one way to be joined, and it is a straight line.
    it('leaves a two-point path as the straight segment it is', () => {
      expect(smoothPath([[-46.6, -23.5], [-46.5, -23.4]])).toEqual([[-46.6, -23.5], [-46.5, -23.4]])
    })

    it('returns a fresh array rather than the one it was given', () => {
      const points: Coordinate[] = [[-46.6, -23.5], [-46.5, -23.4]]
      expect(smoothPath(points)).not.toBe(points)
    })
  })

  describe('the curve it draws', () => {
    const corner: Coordinate[] = [[0, 0], [1, 0], [1, 1]]

    it('passes through every marker it was given', () => {
      const path = smoothPath(corner)
      for (const point of corner) {
        expect(includesPoint(path, point)).toBe(true)
      }
    })

    it('keeps the markers in the order they were given', () => {
      const path = smoothPath(corner)
      const positions = corner.map((point) => path.findIndex(
        ([lng, lat]) => Math.abs(lng - point[0]) < 1e-9 && Math.abs(lat - point[1]) < 1e-9,
      ))
      expect(positions).toEqual([...positions].sort((one, other) => one - other))
    })

    it('starts at the first marker and ends at the last one', () => {
      const path = smoothPath(corner)
      expect(path[0]).toEqual(corner[0])
      expect(path[path.length - 1]).toEqual(corner[2])
    })

    // The whole point: a right-angle turn between two markers comes out as a curve,
    // not as the corner the raw polyline would draw.
    it('rounds off a corner that the straight polyline would leave sharp', () => {
      expect(sharpestTurnDegrees(corner)).toBeCloseTo(90, 5)
      expect(sharpestTurnDegrees(smoothPath(corner))).toBeLessThan(10)
    })

    it('bends smoothly along the whole of a zig-zag, not just at its ends', () => {
      const zigzag: Coordinate[] = [[0, 0], [1, 1], [2, 0], [3, 1], [4, 0]]
      expect(sharpestTurnDegrees(smoothPath(zigzag))).toBeLessThan(15)
    })

    it('samples every segment, so a long path curves along its whole length', () => {
      const points: Coordinate[] = [[0, 0], [1, 0], [2, 1], [3, 1]]
      expect(smoothPath(points, 8)).toHaveLength(8 * 3 + 1)
    })

    it('draws a denser curve when asked for more samples', () => {
      const points: Coordinate[] = [[0, 0], [1, 0], [2, 1]]
      expect(smoothPath(points, 32).length).toBeGreaterThan(smoothPath(points, 8).length)
    })

    // A sampling too coarse to curve would draw the corners back in, so it falls back
    // to the control points rather than pretending.
    it('falls back to the raw points when the sampling is too coarse to curve', () => {
      const points: Coordinate[] = [[0, 0], [1, 0], [2, 1]]
      expect(smoothPath(points, 1)).toEqual(points)
      expect(smoothPath(points, 0)).toEqual(points)
    })

    it('stays inside a sane envelope around the markers instead of swinging wide', () => {
      const points: Coordinate[] = [[0, 0], [1, 0], [1.05, 0.02], [3, 1]]
      const path = smoothPath(points)
      for (const [lng, lat] of path) {
        expect(lng).toBeGreaterThan(-0.5)
        expect(lng).toBeLessThan(3.5)
        expect(lat).toBeGreaterThan(-0.5)
        expect(lat).toBeLessThan(1.5)
      }
    })

    // Three markers in a row describe a straight line; the curve through them has to
    // stay on it rather than wander.
    it('keeps collinear markers on their straight line', () => {
      for (const [lng, lat] of smoothPath([[0, 0], [1, 0], [2, 0], [3, 0]])) {
        expect(lat).toBeCloseTo(0, 9)
        expect(lng).toBeGreaterThanOrEqual(0)
        expect(lng).toBeLessThanOrEqual(3)
      }
    })
  })

  describe('degenerate input', () => {
    // Two markers dropped on the same spot would collapse a knot interval and divide
    // by zero; the repeat is dropped instead.
    it('survives markers stacked on the very same position', () => {
      const path = smoothPath([[0, 0], [1, 0], [1, 0], [2, 1]])
      expect(path.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))).toBe(true)
      expect(includesPoint(path, [2, 1])).toBe(true)
    })

    it('reads a path that repeats down to two distinct points as a straight segment', () => {
      expect(smoothPath([[0, 0], [0, 0], [1, 1], [1, 1]])).toEqual([[0, 0], [1, 1]])
    })

    it('survives a path at the pole, where the longitude scaling would collapse', () => {
      const path = smoothPath([[0, 90], [1, 89.9], [2, 89.8]])
      expect(path.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))).toBe(true)
    })
  })

  // Fitting on raw degrees would bend the curve as if a degree of longitude were as
  // wide as a degree of latitude, which it is not away from the equator.
  describe('geographic fitting', () => {
    it('draws the same shape on the ground wherever the markers are', () => {
      const atEquator = smoothPath([[0, 0], [1, 0.5], [2, 0], [3, 0.5]])
      // The same shape on the ground 60° north, where a degree of longitude covers
      // half the distance a degree of latitude does.
      const farNorth = smoothPath([[0, 60], [2, 60.5], [4, 60], [6, 60.5]])
      expect(farNorth).toHaveLength(atEquator.length)
      farNorth.forEach(([lng, lat], index) => {
        expect(lat - 60).toBeCloseTo(atEquator[index][1], 2)
        expect(lng / 2).toBeCloseTo(atEquator[index][0], 2)
      })
    })
  })
})
