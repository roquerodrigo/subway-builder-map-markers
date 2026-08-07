import { describe, expect, it } from 'vitest'

import type { MarkerRoute } from '@/domain/route/MarkerRoute'
import type { Coordinate } from '@/shared/game/Coordinate'

import { routeUnderPoint } from '@/domain/route/RouteHitTest'

function route(groupId: string, points: Coordinate[], color = '#ef4444'): MarkerRoute {
  return { color, groupId, points }
}

const WITHIN = 0.002 // degrees of latitude, ~220 m

describe('routeUnderPoint', () => {
  it('finds the line a point sits on', () => {
    const hit = routeUnderPoint([route('line-1', [[0, 0], [0.1, 0]])], [0.05, 0], WITHIN)
    expect(hit?.groupId).toBe('line-1')
    expect(hit?.distance).toBeLessThan(1e-6)
  })

  it('finds nothing where no line runs', () => {
    expect(routeUnderPoint([route('line-1', [[0, 0], [0.1, 0]])], [0.05, 0.5], WITHIN)).toBeNull()
  })

  it('respects the distance it was given', () => {
    const routes = [route('line-1', [[0, 0], [0.1, 0]])]
    expect(routeUnderPoint(routes, [0.05, 0.001], WITHIN)).not.toBeNull()
    expect(routeUnderPoint(routes, [0.05, 0.001], 0.0005)).toBeNull()
  })

  it('takes the closest line where two run near each other', () => {
    const routes = [
      route('far', [[0, 0.001], [0.1, 0.001]]),
      route('near', [[0, 0], [0.1, 0]]),
    ]
    expect(routeUnderPoint(routes, [0.05, 0.0001], WITHIN)?.groupId).toBe('near')
  })

  // The line the player sees runs straight through each platform and curves between
  // them, so a point beside a curve is on the line and a point on the straight is too.
  it('hits the line as drawn, not the marker-to-marker polyline', () => {
    const corner = [route('line-1', [[0, 0], [0.05, 0], [0.05, 0.05]] as Coordinate[])]
    // The drawn line swings wide of the corner the raw polyline turns at, so this
    // point is on the line even though it is 130 m off the polyline.
    expect(routeUnderPoint(corner, [0.05116, 0.00138], 0.0002)?.groupId).toBe('line-1')
  })

  it('hits a line beyond its last marker, along the platform it reserves', () => {
    const line = [route('line-1', [[0, 0], [0.05, 0]] as Coordinate[])]
    expect(routeUnderPoint(line, [0.0505, 0], 0.0002)?.groupId).toBe('line-1')
  })

  it('ignores a folder with nothing to draw', () => {
    expect(routeUnderPoint([route('line-1', [])], [0, 0], WITHIN)).toBeNull()
    expect(routeUnderPoint([], [0, 0], WITHIN)).toBeNull()
  })
})
