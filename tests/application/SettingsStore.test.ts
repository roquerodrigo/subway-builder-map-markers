import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsStore } from '@/application/SettingsStore'
import { DEFAULT_SETTINGS } from '@/domain/settings/MarkerSettings'
import { SettingsRepository } from '@/infrastructure/persistence/SettingsRepository'

const PERSIST_DEBOUNCE_MS = 250

function createStore() {
  const repository = new SettingsRepository()
  return { repository, save: vi.spyOn(repository, 'save'), store: new SettingsStore(repository) }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('SettingsStore', () => {
  it('starts from the defaults when nothing was ever persisted', () => {
    expect(createStore().store.get()).toEqual(DEFAULT_SETTINGS)
  })

  it('starts from the persisted settings', () => {
    new SettingsRepository().save({ ...DEFAULT_SETTINGS, radiusMeters: 800 })
    expect(createStore().store.get().radiusMeters).toBe(800)
  })

  it('applies a patch and notifies its subscribers', () => {
    const { store } = createStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.update({ radiusMeters: 700 })
    expect(store.get()).toEqual({ ...DEFAULT_SETTINGS, radiusMeters: 700 })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('leaves the settings a patch does not mention untouched', () => {
    const { store } = createStore()
    store.update({ showLabels: false })
    expect(store.get()).toEqual({ ...DEFAULT_SETTINGS, showLabels: false })
  })

  it('normalizes a patch that is out of range', () => {
    const { store } = createStore()
    store.update({ radiusMeters: 99999 })
    expect(store.get().radiusMeters).toBe(2000)
  })

  it('ignores a patch that changes nothing', () => {
    const { store } = createStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.update({ radiusMeters: DEFAULT_SETTINGS.radiusMeters })
    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores a patch whose value normalizes back to the current one', () => {
    const { store } = createStore()
    store.update({ radiusMeters: 2000 })
    const listener = vi.fn()
    store.subscribe(listener)
    store.update({ radiusMeters: 5000 })
    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies every subscriber', () => {
    const { store } = createStore()
    const first = vi.fn()
    const second = vi.fn()
    store.subscribe(first)
    store.subscribe(second)
    store.update({ showInfluence: false })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('stops notifying a subscriber that unsubscribed', () => {
    const { store } = createStore()
    const listener = vi.fn()
    store.subscribe(listener)()
    store.update({ showInfluence: false })
    expect(listener).not.toHaveBeenCalled()
  })

  it('does not persist before the debounce window has passed', () => {
    const { save, store } = createStore()
    store.update({ radiusMeters: 700 })
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS - 1)
    expect(save).not.toHaveBeenCalled()
  })

  it('coalesces a burst of updates into a single write of the final settings', () => {
    const { save, store } = createStore()
    store.update({ radiusMeters: 600 })
    store.update({ radiusMeters: 700 })
    store.update({ radiusMeters: 800 })
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, radiusMeters: 800 })
  })

  it('persists across stores, so the next session starts where this one left off', () => {
    const { store } = createStore()
    store.update({ idleOpacity: 0.2, showSpacingGuide: false })
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS)
    expect(new SettingsStore(new SettingsRepository()).get()).toEqual({
      ...DEFAULT_SETTINGS,
      idleOpacity: 0.2,
      showSpacingGuide: false,
    })
  })
})
