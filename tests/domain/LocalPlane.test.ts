import { describe, expect, it } from 'vitest'

import type { Coordinate } from '@/shared/game/Coordinate'

import { localPlaneFor, planarDistance } from '@/domain/geo/LocalPlane'

describe('localPlaneFor', () => {
  it('leaves coordinates as they are at the equator, where a degree is a degree', () => {
    const plane = localPlaneFor([[1, 0], [2, 0]])
    expect(plane.project([1.5, 0.5])).toEqual([1.5, 0.5])
  })

  it('shrinks longitude by the cosine of the mean latitude', () => {
    const plane = localPlaneFor([[0, 60], [2, 60]])
    expect(plane.project([1, 60])[0]).toBeCloseTo(Math.cos((60 * Math.PI) / 180), 12)
  })

  it('leaves latitude alone, whatever the longitude does', () => {
    const plane = localPlaneFor([[0, -23.5], [1, -23.5]])
    expect(plane.project([1, -23.4])[1]).toBe(-23.4)
  })

  it('takes the mean of the latitudes it was fitted to', () => {
    const plane = localPlaneFor([[0, 0], [0, 60]])
    expect(plane.project([1, 0])[0]).toBeCloseTo(Math.cos((30 * Math.PI) / 180), 12)
  })

  it('comes back to the coordinate it started from', () => {
    const plane = localPlaneFor([[-46.6, -23.5], [-46.4, -23.4]])
    const point: Coordinate = [-46.55, -23.47]
    const [longitude, latitude] = plane.toGeographic(plane.project(point))
    expect(longitude).toBeCloseTo(point[0], 12)
    expect(latitude).toBeCloseTo(point[1], 12)
  })

  // The cosine reaches zero at the pole, and the trip back would divide by it.
  it('stays invertible at the pole', () => {
    const plane = localPlaneFor([[10, 90], [20, 90]])
    const [longitude, latitude] = plane.toGeographic(plane.project([15, 90]))
    expect(Number.isFinite(longitude)).toBe(true)
    expect(latitude).toBe(90)
  })

  it('fits an empty cluster without dividing by anything', () => {
    expect(localPlaneFor([]).project([1, 0])).toEqual([1, 0])
  })
})

describe('planarDistance', () => {
  it('measures a straight line between two points on the plane', () => {
    expect(planarDistance([0, 0], [3, 4])).toBe(5)
  })

  it('is zero between a point and itself', () => {
    expect(planarDistance([2, 3], [2, 3])).toBe(0)
  })

  it('reads the same in either direction', () => {
    expect(planarDistance([1, 2], [4, 6])).toBe(planarDistance([4, 6], [1, 2]))
  })
})
