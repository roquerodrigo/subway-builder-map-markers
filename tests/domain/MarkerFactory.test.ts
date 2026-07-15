import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMarker } from '../../src/domain/marker/MarkerFactory'
import { DEFAULT_MARKER_ICON } from '../../src/domain/marker/MarkerIconSet'
import { DEFAULT_MARKER_COLOR } from '../../src/domain/marker/MarkerPalette'

const POSITION: [number, number] = [-46.633, -23.55]
const FALLBACK_ID = /^m-[0-9a-z]+-[0-9a-z]+$/

describe('createMarker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('places the marker where it was dropped', () => {
    expect(createMarker(POSITION, 1).position).toEqual([-46.633, -23.55])
  })

  it('starts from the default colour and icon the panel can then edit', () => {
    const marker = createMarker(POSITION, 1)
    expect(marker.color).toBe(DEFAULT_MARKER_COLOR)
    expect(marker.icon).toBe(DEFAULT_MARKER_ICON)
  })

  it('seeds a human label from the 1-based order', () => {
    expect(createMarker(POSITION, 1).label).toBe('Marker 1')
    expect(createMarker(POSITION, 3).label).toBe('Marker 3')
    expect(createMarker(POSITION, 42).label).toBe('Marker 42')
  })

  it('gives every marker its own id', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createMarker(POSITION, 1).id))
    expect(ids.size).toBe(50)
  })

  it('uses the platform uuid generator when there is one', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-from-platform' })
    expect(createMarker(POSITION, 1).id).toBe('uuid-from-platform')
  })

  it('falls back to a generated id when the platform has no crypto', () => {
    vi.stubGlobal('crypto', undefined)
    expect(createMarker(POSITION, 1).id).toMatch(FALLBACK_ID)
  })

  it('falls back to a generated id when crypto cannot make uuids', () => {
    vi.stubGlobal('crypto', {})
    expect(createMarker(POSITION, 1).id).toMatch(FALLBACK_ID)
  })

  it('keeps the fallback ids distinct within the same millisecond', () => {
    vi.stubGlobal('crypto', {})
    const ids = new Set(Array.from({ length: 50 }, () => createMarker(POSITION, 1).id))
    expect(ids.size).toBe(50)
  })
})
