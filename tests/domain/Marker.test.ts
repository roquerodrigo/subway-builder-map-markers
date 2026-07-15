import { describe, expect, it } from 'vitest'

import { OPTIMAL_SPACING_FACTOR } from '../../src/domain/marker/Marker'

// The distance from an equilateral triangle's center to each of its corners,
// computed from the corners rather than from the closed-form identity, so the
// spacing factor is checked against real geometry.
function equilateralCircumradius(side: number): number {
  const corners: [number, number][] = [
    [0, 0],
    [side, 0],
    [side / 2, (side * Math.sqrt(3)) / 2],
  ]
  const centerX = corners.reduce((sum, corner) => sum + corner[0], 0) / corners.length
  const centerY = corners.reduce((sum, corner) => sum + corner[1], 0) / corners.length
  return Math.hypot(corners[0][0] - centerX, corners[0][1] - centerY)
}

describe('OPTIMAL_SPACING_FACTOR', () => {
  it('is the square root of three', () => {
    expect(OPTIMAL_SPACING_FACTOR).toBeCloseTo(1.7320508, 6)
  })

  it('makes three neighboring influence areas meet at exactly one point', () => {
    const radius = 500
    expect(equilateralCircumradius(OPTIMAL_SPACING_FACTOR * radius)).toBeCloseTo(radius, 6)
  })

  it('opens a gap between three influence areas as soon as the spacing grows', () => {
    const radius = 500
    expect(equilateralCircumradius(OPTIMAL_SPACING_FACTOR * 1.01 * radius)).toBeGreaterThan(radius)
  })

  it('overlaps three influence areas as soon as the spacing shrinks', () => {
    const radius = 500
    expect(equilateralCircumradius(OPTIMAL_SPACING_FACTOR * 0.99 * radius)).toBeLessThan(radius)
  })

  it('holds for any influence radius', () => {
    for (const radius of [100, 250, 500, 1000, 2000]) {
      expect(equilateralCircumradius(OPTIMAL_SPACING_FACTOR * radius)).toBeCloseTo(radius, 6)
    }
  })
})
