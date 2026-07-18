import { describe, expect, it } from 'vitest'

import type { Marker } from '@/domain/marker/Marker'
import type { Coordinate } from '@/shared/game/Coordinate'

import { stationNameFromMarkers } from '@/domain/marker/StationNaming'

function marker(label: string, position: Coordinate): Marker {
  return { color: '#ffffff', icon: 'station', id: `id-${label}`, label, position }
}

const ORIGIN: Coordinate = [-46.6334, -23.5505]

describe('stationNameFromMarkers', () => {
  it('names the station after a marker whose influence area covers it', () => {
    expect(stationNameFromMarkers(ORIGIN, [marker('Sé', [-46.6334, -23.5506])], 500)).toBe('Sé')
  })

  it('returns null when no marker area reaches the station', () => {
    expect(stationNameFromMarkers(ORIGIN, [marker('Far', [-46.7, -23.6])], 500)).toBeNull()
  })

  it('picks the nearest marker when several cover the station', () => {
    const near = marker('Near', [-46.6334, -23.5506])
    const farther = marker('Farther', [-46.634, -23.551])
    expect(stationNameFromMarkers(ORIGIN, [farther, near], 500)).toBe('Near')
  })

  it('ignores markers with a blank label', () => {
    const blank = marker('   ', [-46.6334, -23.5505])
    const named = marker('Named', [-46.6335, -23.5506])
    expect(stationNameFromMarkers(ORIGIN, [blank, named], 500)).toBe('Named')
  })

  it('returns null when there are no markers', () => {
    expect(stationNameFromMarkers(ORIGIN, [], 500)).toBeNull()
  })

  it('returns null when the radius is not positive', () => {
    const here = marker('Here', ORIGIN)
    expect(stationNameFromMarkers(ORIGIN, [here], 0)).toBeNull()
    expect(stationNameFromMarkers(ORIGIN, [here], -100)).toBeNull()
  })

  it('trims the label it returns', () => {
    expect(stationNameFromMarkers(ORIGIN, [marker('  Luz  ', ORIGIN)], 500)).toBe('Luz')
  })
})
