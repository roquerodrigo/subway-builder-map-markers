import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { MarkerStore } from '../../src/application/MarkerStore'
import type { Marker } from '../../src/domain/marker/Marker'
import type { MapMarkersController } from '../../src/infrastructure/map/MapMarkersController'

import { useMarkers, usePlacement } from '../../src/presentation/hooks/useMarkers'

function createMarker(id: string, label: string): Marker {
  return { id, position: [-46.63, -23.55], color: '#ef4444', icon: 'station', label }
}

function createStoreDouble(initial: Marker[] = []) {
  const listeners = new Set<() => void>()
  let markers = initial
  let selectedId: null | string = null
  const notify = (): void => listeners.forEach((listener) => listener())
  return {
    all: () => markers,
    selected: () => selectedId,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    listenerCount: () => listeners.size,
    setMarkers: (next: Marker[]) => {
      markers = next
      notify()
    },
    setSelected: (id: null | string) => {
      selectedId = id
      notify()
    },
  }
}

function createControllerDouble(initiallyPlacing = false) {
  const listeners = new Set<(placing: boolean) => void>()
  let placing = initiallyPlacing
  return {
    isPlacing: () => placing,
    onPlacementChange: (listener: (placing: boolean) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    listenerCount: () => listeners.size,
    emit: (next: boolean) => {
      placing = next
      listeners.forEach((listener) => listener(next))
    },
  }
}

describe('useMarkers', () => {
  it('starts from the store rather than an empty list', () => {
    const store = createStoreDouble([createMarker('a', 'Central')])
    const { result } = renderHook(() => useMarkers(store as unknown as MarkerStore))
    expect(result.current.markers).toHaveLength(1)
    expect(result.current.selectedId).toBeNull()
  })

  it('re-renders with the new markers when the store notifies', () => {
    const store = createStoreDouble([createMarker('a', 'Central')])
    const { result } = renderHook(() => useMarkers(store as unknown as MarkerStore))
    act(() => store.setMarkers([createMarker('a', 'Central'), createMarker('b', 'Sé')]))
    expect(result.current.markers.map((marker) => marker.label)).toEqual(['Central', 'Sé'])
  })

  it('picks up a selection made on the map', () => {
    const store = createStoreDouble([createMarker('a', 'Central')])
    const { result } = renderHook(() => useMarkers(store as unknown as MarkerStore))
    act(() => store.setSelected('a'))
    expect(result.current.selectedId).toBe('a')
  })

  it('subscribes once and unsubscribes on unmount', () => {
    const store = createStoreDouble()
    const { unmount } = renderHook(() => useMarkers(store as unknown as MarkerStore))
    expect(store.listenerCount()).toBe(1)
    unmount()
    expect(store.listenerCount()).toBe(0)
  })

  it('moves its subscription when it is handed a different store', () => {
    const first = createStoreDouble([createMarker('a', 'Central')])
    const second = createStoreDouble([createMarker('b', 'Sé')])
    const { rerender, result } = renderHook(
      ({ store }: { store: ReturnType<typeof createStoreDouble> }) => useMarkers(store as unknown as MarkerStore),
      { initialProps: { store: first } },
    )
    rerender({ store: second })
    expect(first.listenerCount()).toBe(0)
    expect(second.listenerCount()).toBe(1)
    expect(result.current.markers.map((marker) => marker.label)).toEqual(['Sé'])
  })
})

describe('usePlacement', () => {
  it('starts from the controller placement state', () => {
    const controller = createControllerDouble(true)
    const { result } = renderHook(() => usePlacement(controller as unknown as MapMarkersController))
    expect(result.current).toBe(true)
  })

  it('follows the controller when the map finishes a placement', () => {
    const controller = createControllerDouble(true)
    const { result } = renderHook(() => usePlacement(controller as unknown as MapMarkersController))
    act(() => controller.emit(false))
    expect(result.current).toBe(false)
  })

  it('subscribes once and unsubscribes on unmount', () => {
    const controller = createControllerDouble()
    const { unmount } = renderHook(() => usePlacement(controller as unknown as MapMarkersController))
    expect(controller.listenerCount()).toBe(1)
    unmount()
    expect(controller.listenerCount()).toBe(0)
  })

  it('moves its subscription when it is handed a different controller', () => {
    const first = createControllerDouble()
    const second = createControllerDouble()
    const { rerender } = renderHook(
      ({ controller }: { controller: ReturnType<typeof createControllerDouble> }) =>
        usePlacement(controller as unknown as MapMarkersController),
      { initialProps: { controller: first } },
    )
    rerender({ controller: second })
    expect(first.listenerCount()).toBe(0)
    expect(second.listenerCount()).toBe(1)
  })

  it('ignores a notification that arrives after unmount', () => {
    const controller = createControllerDouble()
    const { unmount } = renderHook(() => usePlacement(controller as unknown as MapMarkersController))
    unmount()
    expect(() => controller.emit(true)).not.toThrow()
  })
})

describe('useMarkers snapshot identity', () => {
  it('hands the panel a fresh snapshot on every notification', () => {
    const store = createStoreDouble([createMarker('a', 'Central')])
    const { result } = renderHook(() => useMarkers(store as unknown as MarkerStore))
    const first = result.current
    act(() => store.setSelected('a'))
    expect(result.current).not.toBe(first)
  })
})
