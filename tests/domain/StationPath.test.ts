import { describe, expect, it } from 'vitest'

import type { Coordinate } from '@/shared/game/Coordinate'

import { PLATFORM_LENGTH_METERS, stationPath } from '@/domain/route/StationPath'

const METERS_PER_DEGREE = 111320

function bearing(from: Coordinate, to: Coordinate, latitude = 0): number {
  const scale = Math.cos((latitude * Math.PI) / 180)

  return (Math.atan2(to[1] - from[1], (to[0] - from[0]) * scale) * 180) / Math.PI
}

function indexOfPoint(path: Coordinate[], point: Coordinate): number {
  return path.findIndex(([lng, lat]) => Math.abs(lng - point[0]) < 1e-12 && Math.abs(lat - point[1]) < 1e-12)
}

function meters(from: Coordinate, to: Coordinate): number {
  const scale = Math.cos(((from[1] + to[1]) / 2) * (Math.PI / 180))

  return Math.hypot((to[0] - from[0]) * scale, to[1] - from[1]) * METERS_PER_DEGREE
}

// The largest turn between consecutive segments: how sharp the sharpest corner is.
function sharpestTurnDegrees(path: Coordinate[], latitude = 0): number {
  let sharpest = 0
  for (let index = 1; index < path.length - 1; index++) {
    const incoming = bearing(path[index - 1], path[index], latitude)
    const outgoing = bearing(path[index], path[index + 1], latitude)
    sharpest = Math.max(sharpest, Math.abs(((outgoing - incoming + 540) % 360) - 180))
  }

  return sharpest
}

describe('stationPath platforms', () => {
  // A station is not a point: the game lays a 229 m platform and the track runs
  // straight through it, so the line has to reserve that much.
  it('reserves a straight platform at every station', () => {
    const { platforms } = stationPath([[0, 0], [0.05, 0], [0.1, 0]])
    expect(platforms).toHaveLength(3)
    for (const platform of platforms) {
      expect(platform).toHaveLength(2)
      expect(meters(platform[0], platform[1])).toBeCloseTo(PLATFORM_LENGTH_METERS, 0)
    }
  })

  it('centres each platform on its marker', () => {
    const markers: Coordinate[] = [[0, 0], [0.05, 0.02], [0.1, 0]]
    const { platforms } = stationPath(markers)
    platforms.forEach((platform, index) => {
      expect((platform[0][0] + platform[1][0]) / 2).toBeCloseTo(markers[index][0], 9)
      expect((platform[0][1] + platform[1][1]) / 2).toBeCloseTo(markers[index][1], 9)
    })
  })

  // The platform lies along the track, so it points the way the line travels — through
  // the neighbours on either side, not at one of them.
  it('lines the platform up with the direction the line travels', () => {
    const { platforms } = stationPath([[0, 0], [0.05, 0], [0.1, 0]])
    expect(bearing(platforms[1][0], platforms[1][1])).toBeCloseTo(0, 6)
  })

  it('turns the platform with the line', () => {
    const { platforms } = stationPath([[0, 0], [0.05, 0.05], [0.1, 0.1]])
    expect(bearing(platforms[1][0], platforms[1][1])).toBeCloseTo(45, 1)
  })

  it('points an end platform at its only neighbour', () => {
    const { platforms } = stationPath([[0, 0], [0, 0.05], [0.01, 0.1]])
    expect(bearing(platforms[0][0], platforms[0][1])).toBeCloseTo(90, 1)
  })

  // Two markers closer together than a platform is long would otherwise overlap, or
  // turn the line inside out where the platforms cross.
  it('shortens the platforms where two stations sit almost on top of each other', () => {
    const close = 100 / METERS_PER_DEGREE
    const { platforms } = stationPath([[0, 0], [close, 0], [0.1, 0]])
    expect(meters(platforms[0][0], platforms[0][1])).toBeLessThan(100)
    expect(meters(platforms[1][0], platforms[1][1])).toBeLessThan(100)
  })

  it('gives a lone marker a platform of its own', () => {
    const { path, platforms } = stationPath([[0, 0]])
    expect(platforms).toHaveLength(1)
    expect(path).toHaveLength(2)
    expect(meters(path[0], path[1])).toBeCloseTo(PLATFORM_LENGTH_METERS, 0)
  })

  it('draws nothing for an empty folder', () => {
    expect(stationPath([])).toEqual({ path: [], platforms: [] })
  })

  it('drops a repeated marker rather than dividing by the gap between them', () => {
    const { path, platforms } = stationPath([[0, 0], [0, 0], [0.05, 0]])
    expect(platforms).toHaveLength(2)
    expect(path.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))).toBe(true)
  })

  it('takes a platform length of its own', () => {
    const { platforms } = stationPath([[0, 0], [0.05, 0]], { platformMeters: 500 })
    expect(meters(platforms[0][0], platforms[0][1])).toBeCloseTo(500, 0)
  })
})

describe('stationPath line', () => {
  it('runs through every platform, in order', () => {
    const { path, platforms } = stationPath([[0, 0], [0.05, 0.01], [0.1, 0]])
    for (const platform of platforms) {
      for (const end of platform) {
        expect(path.some(([lng, lat]) => Math.abs(lng - end[0]) < 1e-12 && Math.abs(lat - end[1]) < 1e-12)).toBe(true)
      }
    }
    expect(path[0]).toEqual(platforms[0][0])
    expect(path[path.length - 1]).toEqual(platforms[2][1])
  })

  // The whole point of the platform: the track is straight where the station is, and
  // curves only between stations.
  it('runs dead straight through a platform', () => {
    const { path, platforms } = stationPath([[0, 0], [0.05, 0.02], [0.1, 0]])
    const entry = indexOfPoint(path, platforms[1][0])
    expect(path[entry + 1]).toEqual(platforms[1][1])
  })

  it('rounds off a corner that a bare polyline would leave sharp', () => {
    const corner: Coordinate[] = [[0, 0], [0.05, 0], [0.05, 0.05]]
    expect(sharpestTurnDegrees(corner)).toBeCloseTo(90, 5)
    expect(sharpestTurnDegrees(stationPath(corner).path)).toBeLessThan(15)
  })

  it('bends smoothly along the whole of a zig-zag, not just at its ends', () => {
    const zigzag: Coordinate[] = [[0, 0], [0.05, 0.05], [0.1, 0], [0.15, 0.05], [0.2, 0]]
    expect(sharpestTurnDegrees(stationPath(zigzag).path)).toBeLessThan(20)
  })

  // The first step off a platform still bends a little — it is a sample of the curve,
  // not the tangent itself — so this is a kink test, not an equality one.
  it('leaves a platform along the platform s own direction, so there is no kink', () => {
    const { path, platforms } = stationPath([[0, 0], [0.05, 0.02], [0.1, 0]])
    const exit = indexOfPoint(path, platforms[0][1])
    const turn = bearing(path[exit], path[exit + 1]) - bearing(platforms[0][0], platforms[0][1])
    expect(Math.abs(turn)).toBeLessThan(2)
  })

  it('samples every gap, so a long line curves along its whole length', () => {
    const points: Coordinate[] = [[0, 0], [0.05, 0], [0.1, 0.05], [0.15, 0.05]]
    const { path } = stationPath(points, { samplesPerSegment: 8 })
    expect(path).toHaveLength(2 * 4 + 3 * 7)
  })

  it('draws a denser curve when asked for more samples', () => {
    const points: Coordinate[] = [[0, 0], [0.05, 0], [0.1, 0.05]]
    expect(stationPath(points, { samplesPerSegment: 32 }).path.length)
      .toBeGreaterThan(stationPath(points, { samplesPerSegment: 8 }).path.length)
  })

  it('keeps collinear stations on their straight line', () => {
    for (const [, latitude] of stationPath([[0, 0], [0.05, 0], [0.1, 0], [0.15, 0]]).path) {
      expect(latitude).toBeCloseTo(0, 9)
    }
  })

  it('stays inside a sane envelope around the markers instead of swinging wide', () => {
    for (const [lng, lat] of stationPath([[0, 0], [0.05, 0], [0.055, 0.002], [0.15, 0.05]]).path) {
      expect(lng).toBeGreaterThan(-0.02)
      expect(lng).toBeLessThan(0.17)
      expect(lat).toBeGreaterThan(-0.02)
      expect(lat).toBeLessThan(0.07)
    }
  })
})

// Fitting on raw degrees would tilt every platform and bend the curve in the wrong
// place, since a degree of longitude is not a degree of latitude away from the equator.
describe('stationPath geographic fitting', () => {
  it('draws the same shape on the ground wherever the markers are', () => {
    const atEquator = stationPath([[0, 0], [0.05, 0.025], [0.1, 0]]).path
    // The same shape on the ground 60° north, where a degree of longitude covers half
    // the distance a degree of latitude does.
    const farNorth = stationPath([[0, 60], [0.1, 60.025], [0.2, 60]]).path
    expect(farNorth).toHaveLength(atEquator.length)
    farNorth.forEach(([lng, lat], index) => {
      expect(lat - 60).toBeCloseTo(atEquator[index][1], 3)
      expect(lng / 2).toBeCloseTo(atEquator[index][0], 3)
    })
  })

  it('keeps a platform the same length on the ground at any latitude', () => {
    const { platforms } = stationPath([[0, 60], [0.1, 60]])
    expect(meters(platforms[0][0], platforms[0][1])).toBeCloseTo(PLATFORM_LENGTH_METERS, 0)
  })

  it('survives a line at the pole, where the longitude scaling would collapse', () => {
    const { path } = stationPath([[0, 90], [1, 89.9], [2, 89.8]])
    expect(path.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))).toBe(true)
  })
})
