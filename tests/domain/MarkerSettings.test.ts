import { describe, expect, it } from 'vitest'

import {
  DEFAULT_IDLE_OPACITY,
  DEFAULT_RADIUS_METERS,
  DEFAULT_SETTINGS,
  IDLE_OPACITY_STEP,
  MAX_IDLE_OPACITY,
  MAX_RADIUS_METERS,
  MIN_IDLE_OPACITY,
  MIN_RADIUS_METERS,
  normalizeSettings,
  RADIUS_STEP_METERS,
  settingsEqual,
} from '@/domain/settings/MarkerSettings'

type Settings = typeof DEFAULT_SETTINGS

const TOGGLE_KEYS = ['showInfluence', 'showLabels', 'showRouteLines', 'showSpacingGuide', 'snapToSpacing'] as const

// Every field different from DEFAULT_SETTINGS, so settingsEqual can be probed one
// field at a time.
const OTHER_SETTINGS: Settings = {
  idleOpacity: 0.9,
  nameStationsFromMarkers: true,
  radiusMeters: 900,
  showInfluence: false,
  showLabels: false,
  showRouteLines: false,
  showSpacingGuide: false,
  snapToSpacing: false,
}

describe('DEFAULT_SETTINGS', () => {
  it('sits inside the ranges the config tab allows', () => {
    expect(DEFAULT_SETTINGS.radiusMeters).toBeGreaterThanOrEqual(MIN_RADIUS_METERS)
    expect(DEFAULT_SETTINGS.radiusMeters).toBeLessThanOrEqual(MAX_RADIUS_METERS)
    expect(DEFAULT_SETTINGS.idleOpacity).toBeGreaterThanOrEqual(MIN_IDLE_OPACITY)
    expect(DEFAULT_SETTINGS.idleOpacity).toBeLessThanOrEqual(MAX_IDLE_OPACITY)
  })

  it('uses the documented default radius and idle opacity', () => {
    expect(DEFAULT_SETTINGS.radiusMeters).toBe(DEFAULT_RADIUS_METERS)
    expect(DEFAULT_SETTINGS.idleOpacity).toBe(DEFAULT_IDLE_OPACITY)
  })

  // Hiding the overlay outright is a legitimate way to play with the board parked, and
  // it can't be a trap: the panel restores full opacity, and a faded overlay takes no
  // clicks either way.
  it('lets the overlay fade all the way out', () => {
    expect(MIN_IDLE_OPACITY).toBe(0)
    expect(MAX_IDLE_OPACITY).toBe(1)
  })

  it('shows everything until the player turns it off', () => {
    for (const key of TOGGLE_KEYS) {
      expect(DEFAULT_SETTINGS[key]).toBe(true)
    }
  })

  it('keeps the station-naming opt-in off by default', () => {
    expect(DEFAULT_SETTINGS.nameStationsFromMarkers).toBe(false)
  })

  // A step that doesn't divide the range would leave the slider unable to reach the
  // bound it advertises.
  it('lets each slider step land exactly on both ends of its range', () => {
    expect((MAX_RADIUS_METERS - MIN_RADIUS_METERS) / RADIUS_STEP_METERS % 1).toBe(0)
    expect((MAX_IDLE_OPACITY - MIN_IDLE_OPACITY) / IDLE_OPACITY_STEP % 1).toBeCloseTo(0, 6)
  })
})

describe('normalizeSettings', () => {
  it('falls back to the defaults when nothing was ever stored', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps a stored object that is already valid', () => {
    expect(normalizeSettings(OTHER_SETTINGS)).toEqual(OTHER_SETTINGS)
  })

  it('returns a fresh object rather than the stored one', () => {
    const stored = { ...OTHER_SETTINGS }
    const normalized = normalizeSettings(stored)
    expect(normalized).not.toBe(stored)
    normalized.radiusMeters = 1234
    expect(stored.radiusMeters).toBe(900)
  })

  it('drops fields that are not settings', () => {
    const stored = { radiusMeters: 700, staleField: 'from an older version' }
    expect(normalizeSettings(stored)).toEqual({ ...DEFAULT_SETTINGS, radiusMeters: 700 })
  })

  it('heals a partial object without disturbing the fields it does have', () => {
    expect(normalizeSettings({ radiusMeters: 800, showLabels: false })).toEqual({
      ...DEFAULT_SETTINGS,
      radiusMeters: 800,
      showLabels: false,
    })
  })

  it('clamps a radius outside the allowed range back to the nearest bound', () => {
    expect(normalizeSettings({ radiusMeters: MIN_RADIUS_METERS - 1 }).radiusMeters)
      .toBe(MIN_RADIUS_METERS)
    expect(normalizeSettings({ radiusMeters: MAX_RADIUS_METERS + 1 }).radiusMeters)
      .toBe(MAX_RADIUS_METERS)
    expect(normalizeSettings({ radiusMeters: -0 }).radiusMeters).toBe(MIN_RADIUS_METERS)
    expect(normalizeSettings({ radiusMeters: 1e9 }).radiusMeters).toBe(MAX_RADIUS_METERS)
  })

  it('keeps a radius that is already inside the range, bounds included', () => {
    expect(normalizeSettings({ radiusMeters: MIN_RADIUS_METERS }).radiusMeters)
      .toBe(MIN_RADIUS_METERS)
    expect(normalizeSettings({ radiusMeters: MAX_RADIUS_METERS }).radiusMeters)
      .toBe(MAX_RADIUS_METERS)
    expect(normalizeSettings({ radiusMeters: 750 }).radiusMeters).toBe(750)
  })

  it('clamps an idle opacity outside the allowed range back to the nearest bound', () => {
    expect(normalizeSettings({ idleOpacity: 0 }).idleOpacity).toBe(MIN_IDLE_OPACITY)
    expect(normalizeSettings({ idleOpacity: -3 }).idleOpacity).toBe(MIN_IDLE_OPACITY)
    expect(normalizeSettings({ idleOpacity: 1.5 }).idleOpacity).toBe(MAX_IDLE_OPACITY)
  })

  it('keeps an idle opacity that is already inside the range', () => {
    expect(normalizeSettings({ idleOpacity: MIN_IDLE_OPACITY }).idleOpacity)
      .toBe(MIN_IDLE_OPACITY)
    expect(normalizeSettings({ idleOpacity: MAX_IDLE_OPACITY }).idleOpacity)
      .toBe(MAX_IDLE_OPACITY)
    expect(normalizeSettings({ idleOpacity: 0.35 }).idleOpacity).toBe(0.35)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'falls back to the defaults for the non-finite number %p',
    (value) => {
      expect(normalizeSettings({ idleOpacity: value, radiusMeters: value })).toEqual(DEFAULT_SETTINGS)
    },
  )

  it.each([['a string'], [null], [{}], [[]], [true]])(
    'falls back to the defaults for a number field holding %p',
    (value) => {
      const stored = { idleOpacity: value, radiusMeters: value } as unknown as Settings
      expect(normalizeSettings(stored)).toEqual(DEFAULT_SETTINGS)
    },
  )

  it.each(TOGGLE_KEYS)('leaves %s on when it was never stored', (key) => {
    expect(normalizeSettings({ [key]: undefined })[key]).toBe(true)
  })

  it.each(TOGGLE_KEYS)('turns %s off when it was stored off', (key) => {
    expect(normalizeSettings({ [key]: false })[key]).toBe(false)
  })

  it.each(TOGGLE_KEYS)('leaves %s on when it was stored on', (key) => {
    expect(normalizeSettings({ [key]: true })[key]).toBe(true)
  })

  it('defaults the station-naming opt-in to off, and reads a stored boolean back', () => {
    expect(normalizeSettings({}).nameStationsFromMarkers).toBe(false)
    expect(normalizeSettings({ nameStationsFromMarkers: undefined }).nameStationsFromMarkers).toBe(false)
    expect(normalizeSettings({ nameStationsFromMarkers: true }).nameStationsFromMarkers).toBe(true)
    expect(normalizeSettings({ nameStationsFromMarkers: false }).nameStationsFromMarkers).toBe(false)
  })

  it('drops a non-boolean station-naming opt-in back to off', () => {
    const stored = { nameStationsFromMarkers: 'yes' } as unknown as Settings
    expect(normalizeSettings(stored).nameStationsFromMarkers).toBe(false)
  })

  it('normalizes an already normalized object to itself', () => {
    const once = normalizeSettings({ idleOpacity: 5, radiusMeters: 5 })
    expect(normalizeSettings(once)).toEqual(once)
  })
})

describe('settingsEqual', () => {
  it('accepts two separately built copies of the same settings', () => {
    expect(settingsEqual(normalizeSettings(undefined), normalizeSettings({}))).toBe(true)
    expect(settingsEqual(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS })).toBe(true)
  })

  it('accepts a value against itself', () => {
    expect(settingsEqual(DEFAULT_SETTINGS, DEFAULT_SETTINGS)).toBe(true)
  })

  it('rejects settings that differ in every field', () => {
    expect(settingsEqual(DEFAULT_SETTINGS, OTHER_SETTINGS)).toBe(false)
  })

  it.each(Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[])(
    'rejects settings that differ only in %s',
    (key) => {
      const changed: Settings = { ...DEFAULT_SETTINGS, [key]: OTHER_SETTINGS[key] }
      expect(settingsEqual(DEFAULT_SETTINGS, changed)).toBe(false)
      expect(settingsEqual(changed, DEFAULT_SETTINGS)).toBe(false)
    },
  )

  it('reads a barely-different radius as different', () => {
    const changed: Settings = { ...DEFAULT_SETTINGS, radiusMeters: DEFAULT_RADIUS_METERS + 1 }
    expect(settingsEqual(DEFAULT_SETTINGS, changed)).toBe(false)
  })
})
