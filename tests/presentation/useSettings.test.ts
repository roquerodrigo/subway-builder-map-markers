import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { SettingsStore } from '../../src/application/SettingsStore'
import type { MarkerSettings } from '../../src/domain/settings/MarkerSettings'

import { DEFAULT_SETTINGS } from '../../src/domain/settings/MarkerSettings'
import { useSettings } from '../../src/presentation/hooks/useSettings'

function createSettingsDouble(initial: MarkerSettings = DEFAULT_SETTINGS) {
  const listeners = new Set<() => void>()
  let settings = initial
  return {
    get: () => settings,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    listenerCount: () => listeners.size,
    set: (patch: Partial<MarkerSettings>) => {
      settings = { ...settings, ...patch }
      listeners.forEach((listener) => listener())
    },
  }
}

describe('useSettings', () => {
  it('starts from the store rather than the defaults', () => {
    const store = createSettingsDouble({ ...DEFAULT_SETTINGS, radiusMeters: 800 })
    const { result } = renderHook(() => useSettings(store as unknown as SettingsStore))
    expect(result.current.radiusMeters).toBe(800)
  })

  it('re-renders when the store notifies', () => {
    const store = createSettingsDouble()
    const { result } = renderHook(() => useSettings(store as unknown as SettingsStore))
    act(() => store.set({ showLabels: false }))
    expect(result.current.showLabels).toBe(false)
  })

  it('subscribes once and unsubscribes on unmount', () => {
    const store = createSettingsDouble()
    const { unmount } = renderHook(() => useSettings(store as unknown as SettingsStore))
    expect(store.listenerCount()).toBe(1)
    unmount()
    expect(store.listenerCount()).toBe(0)
  })

  it('moves its subscription when it is handed a different store', () => {
    const first = createSettingsDouble()
    const second = createSettingsDouble({ ...DEFAULT_SETTINGS, idleOpacity: 1 })
    const { rerender, result } = renderHook(
      ({ store }: { store: ReturnType<typeof createSettingsDouble> }) => useSettings(store as unknown as SettingsStore),
      { initialProps: { store: first } },
    )
    rerender({ store: second })
    expect(first.listenerCount()).toBe(0)
    expect(second.listenerCount()).toBe(1)
    expect(result.current.idleOpacity).toBe(1)
  })
})
