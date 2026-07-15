import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../../src/domain/settings/MarkerSettings'
import { SettingsRepository } from '../../src/infrastructure/persistence/SettingsRepository'

const STORAGE_KEY = 'subwaybuilder.map-markers.settings'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SettingsRepository', () => {
  it('returns the defaults when nothing was ever saved', () => {
    expect(new SettingsRepository().load()).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips the settings through localStorage', () => {
    const repository = new SettingsRepository()
    const settings = { ...DEFAULT_SETTINGS, radiusMeters: 800, showLabels: false }
    repository.save(settings)
    expect(new SettingsRepository().load()).toEqual(settings)
  })

  it('writes to one bucket for the whole mod', () => {
    new SettingsRepository().save(DEFAULT_SETTINGS)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(DEFAULT_SETTINGS))
  })

  it('heals a stored payload that is missing fields', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ showLabels: false }))
    expect(new SettingsRepository().load()).toEqual({ ...DEFAULT_SETTINGS, showLabels: false })
  })

  it('clamps a stored value that is out of range', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ radiusMeters: 99999 }))
    expect(new SettingsRepository().load().radiusMeters).toBe(2000)
  })

  it('returns the defaults when the stored payload is not readable JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{ not json')
    expect(new SettingsRepository().load()).toEqual(DEFAULT_SETTINGS)
  })

  it('returns the defaults when the stored payload is an empty string', () => {
    window.localStorage.setItem(STORAGE_KEY, '')
    expect(new SettingsRepository().load()).toEqual(DEFAULT_SETTINGS)
  })

  it('returns the defaults when reading throws because storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    expect(new SettingsRepository().load()).toEqual(DEFAULT_SETTINGS)
  })

  it('warns instead of throwing when writing fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => new SettingsRepository().save(DEFAULT_SETTINGS)).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })
})
