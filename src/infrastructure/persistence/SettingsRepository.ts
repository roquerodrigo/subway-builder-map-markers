import type { MarkerSettings } from '@/domain/settings/MarkerSettings'

import { DEFAULT_SETTINGS, normalizeSettings } from '@/domain/settings/MarkerSettings'
import { logger } from '@/shared/Logger'

const STORAGE_KEY = 'subwaybuilder.map-markers.settings'

// Persists the global display settings to localStorage (one bucket for the whole
// mod — these are player preferences, not per-city). Reads are defensive: a
// malformed payload falls back to the defaults.
export class SettingsRepository {
  load(): MarkerSettings {
    let raw: null | string
    try {
      raw = window.localStorage.getItem(STORAGE_KEY)
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
    if (!raw) {
      return { ...DEFAULT_SETTINGS }
    }
    try {
      return normalizeSettings(JSON.parse(raw) as Partial<MarkerSettings>)
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  save(settings: MarkerSettings): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      logger.warn('could not persist settings (storage unavailable)')
    }
  }
}
