import { describe, expect, it } from 'vitest'

import type { RoadSegment } from '@/domain/naming/RoadStationName'
import type { Coordinate } from '@/shared/game/Coordinate'

import { formatRoadName, ROAD_SEARCH_RADII, stationNameFromRoads } from '@/domain/naming/RoadStationName'

const AT: Coordinate = [0, 0]
// A degree is ~111 km, so these sit within the first search radius (~110 m).
const NORTH_SOUTH: RoadSegment = { coordinates: [[0.0002, -0.0005], [0.0002, 0.0005]], name: 'Cross Street' }
const EAST_WEST: RoadSegment = { coordinates: [[-0.0005, 0.0001], [0.0005, 0.0001]], name: 'Along Avenue' }

function found(...radii: RoadSegment[][]): (radius: number) => RoadSegment[] {
  return (radius) => radii[ROAD_SEARCH_RADII.indexOf(radius)] ?? []
}

describe('stationNameFromRoads', () => {
  // A station is named after the street it crosses far more often than the one it
  // runs along — the game's own preference, and the reason the line's bearing matters.
  it('prefers the street the line crosses', () => {
    const name = stationNameFromRoads(AT, 90, found([EAST_WEST, NORTH_SOUTH]))
    expect(name).toBe('Cross St')
  })

  it('takes the nearest road when there is no line to cross', () => {
    const name = stationNameFromRoads(AT, null, found([NORTH_SOUTH, EAST_WEST]))
    expect(name).toBe('Along Av')
  })

  it('takes the nearest cross street when several cross', () => {
    const far: RoadSegment = { coordinates: [[0.004, -0.0005], [0.004, 0.0005]], name: 'Far Street' }
    expect(stationNameFromRoads(AT, 90, found([NORTH_SOUTH, far]))).toBe('Cross St')
  })

  // The search widens only when the last radius turned up nothing usable, which is how
  // a station out in the open still finds a name.
  it('widens the search until it finds a road', () => {
    expect(stationNameFromRoads(AT, null, found([], [], [EAST_WEST]))).toBe('Along Av')
  })

  it('has no name to give where there are no roads at all', () => {
    expect(stationNameFromRoads(AT, null, found())).toBeNull()
  })

  it('ignores a road with no name and one with no shape', () => {
    const nameless: RoadSegment = { coordinates: [[0, 0], [0, 0.001]], name: '' }
    const shapeless: RoadSegment = { coordinates: [[0, 0]], name: 'Shapeless Street' }
    expect(stationNameFromRoads(AT, null, found([nameless, shapeless]))).toBeNull()
  })

  // A name that is nothing but a suffix names nothing.
  it('skips a road whose whole name is a suffix', () => {
    const suffix: RoadSegment = { ...NORTH_SOUTH, name: 'Street' }
    expect(stationNameFromRoads(AT, null, found([suffix, EAST_WEST]))).toBe('Along Av')
  })

  it('abbreviates the name it returns', () => {
    const road: RoadSegment = { ...EAST_WEST, name: '42nd Street Extension' }
    expect(stationNameFromRoads(AT, null, found([road]))).toBe('42 St')
  })
})

describe('formatRoadName', () => {
  it.each([
    ['Main Street', 'Main St'],
    ['Ocean Avenue', 'Ocean Av'],
    ['Sunset Boulevard', 'Sunset Blvd'],
    ['Grand Concourse Road', 'Grand Concourse Rd'],
    ['Hylan Parkway', 'Hylan Pkwy'],
    ['Jackson Heights', 'Jackson Hts'],
    ['Union Square', 'Union Sq'],
    ['Belt Highway', 'Belt Hwy'],
  ])('abbreviates %s', (name, expected) => {
    expect(formatRoadName(name)).toBe(expected)
  })

  it('drops the ordinal suffix of a numbered street', () => {
    expect(formatRoadName('42nd Street')).toBe('42 St')
    expect(formatRoadName('1st Avenue')).toBe('1 Av')
  })

  it('drops a direction from a longer name', () => {
    expect(formatRoadName('West Houston Street')).toBe('Houston St')
  })

  // Two words and the direction is the name, not a modifier.
  it('keeps a direction that opens a two-word name', () => {
    expect(formatRoadName('West Broadway')).toBe('West Broadway')
  })

  it('drops what an extension adds', () => {
    expect(formatRoadName('Bushwick Avenue Extension')).toBe('Bushwick Av')
  })

  it('leaves a name it has nothing to say about alone', () => {
    expect(formatRoadName('Avenida Paulista')).toBe('Avenida Paulista')
  })

  it('collapses the spaces its removals leave behind', () => {
    expect(formatRoadName('North  Main   Street')).toBe('Main St')
  })

  it('has nothing to format in an empty name', () => {
    expect(formatRoadName('')).toBe('')
  })
})
