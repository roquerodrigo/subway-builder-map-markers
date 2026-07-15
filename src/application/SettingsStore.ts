import type { MarkerSettings } from '@/domain/settings/MarkerSettings'
import type { SettingsRepository } from '@/infrastructure/persistence/SettingsRepository'

import { normalizeSettings, settingsEqual } from '@/domain/settings/MarkerSettings'

type Listener = () => void

const PERSIST_DEBOUNCE_MS = 250

// The single source of truth for the global display settings, shared by the config
// tab (which edits them) and the map layers (which read them). Every change
// notifies subscribers and, debounced, persists — dragging the radius slider
// produces a burst of updates that coalesce into one write.
export class SettingsStore {
  private listeners = new Set<Listener>()
  private persistTimer: null | ReturnType<typeof setTimeout> = null
  private settings: MarkerSettings

  constructor(private readonly repository: SettingsRepository) {
    this.settings = repository.load()
  }

  get(): MarkerSettings {
    return this.settings
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  update(patch: Partial<MarkerSettings>): void {
    const next = normalizeSettings({ ...this.settings, ...patch })
    if (settingsEqual(next, this.settings)) {
      return
    }
    this.settings = next
    this.notify()
    this.schedulePersist()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer)
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.repository.save(this.settings)
    }, PERSIST_DEBOUNCE_MS)
  }
}
