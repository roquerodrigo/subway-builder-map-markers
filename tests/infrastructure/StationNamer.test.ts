import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MarkerStore } from '@/application/MarkerStore'
import type { SettingsStore } from '@/application/SettingsStore'
import type { Marker } from '@/domain/marker/Marker'
import type { MarkerSettings } from '@/domain/settings/MarkerSettings'
import type { Coordinate } from '@/shared/game/Coordinate'
import type { GameStation } from '@/shared/game/StoreCallbacks'
import type { SubwayBuilderApi } from '@/shared/game/SubwayBuilderApi'

import { DEFAULT_SETTINGS } from '@/domain/settings/MarkerSettings'
import { StationNamer } from '@/infrastructure/game/StationNamer'

const SE: Coordinate = [-46.6334, -23.5505]
const FAR: Coordinate = [-46.9, -23.9]

function blueprint(id: string, name: string, coords: Coordinate): GameStation {
  return { buildType: 'blueprint', coords, id, name }
}

function constructed(id: string, name: string, coords: Coordinate): GameStation {
  return { buildType: 'constructed', coords, id, name }
}

function createApi() {
  const handlers: Record<string, (() => void) | undefined> = {}
  const api = {
    hooks: {
      onCityLoad: (callback: () => void) => {
        handlers.onCityLoad = callback
      },
      onGameLoaded: (callback: () => void) => {
        handlers.onGameLoaded = callback
      },
    },
  } as unknown as SubwayBuilderApi

  return { api, handlers }
}

function createStoreDouble(initial: GameStation[] = []) {
  const state = {
    setStations(next: GameStation[]): void {
      state.stations = next
    },
    stations: [...initial],
  }

  return {
    build: (next: GameStation[]): void => {
      state.setStations(next)
    },
    getState: () => state,
    nameOf: (id: string): string | undefined => state.stations.find((entry) => entry.id === id)?.name,
    stationsOf: () => state.stations,
  }
}

function install(store: null | ReturnType<typeof createStoreDouble>, markers: Marker[], settings: MarkerSettings) {
  const namer = new StationNamer(store, markersDouble(markers), settingsDouble(settings))
  const { api, handlers } = createApi()
  namer.install(api)

  return { handlers }
}

function marker(label: string, position: Coordinate): Marker {
  return { color: '#ffffff', icon: 'station', id: `m-${label}`, label, position }
}

function markersDouble(visible: Marker[]): MarkerStore {
  return { visibleMarkers: () => visible } as unknown as MarkerStore
}

function on(settings: Partial<MarkerSettings> = {}): MarkerSettings {
  return { ...DEFAULT_SETTINGS, nameStationsFromMarkers: true, ...settings }
}

function settingsDouble(settings: MarkerSettings): SettingsStore {
  return { get: () => settings } as unknown as SettingsStore
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('StationNamer', () => {
  it('names a blueprint placed inside a marker area the instant it enters state', () => {
    const store = createStoreDouble()
    install(store, [marker('Sé', SE)], on())

    store.build([blueprint('new', 'Rua Qualquer', SE)])

    expect(store.nameOf('new')).toBe('Sé')
  })

  it('keeps every other field of the renamed station', () => {
    const store = createStoreDouble()
    install(store, [marker('Sé', SE)], on())

    store.build([{ buildType: 'blueprint', coords: SE, id: 'new', maxCars: 8, name: 'Auto' } as unknown as GameStation])

    const renamed = store.stationsOf().find((entry) => entry.id === 'new') as unknown as Record<string, unknown>
    expect(renamed.name).toBe('Sé')
    expect(renamed.maxCars).toBe(8)
  })

  it('re-applies the name as the station crosses from blueprint to constructed', () => {
    const store = createStoreDouble([blueprint('x', 'Sé', SE)])
    install(store, [marker('Sé', SE)], on())

    // The game re-derives the name on construction; the mod must win it back.
    store.build([constructed('x', 'Rua Re-derivada', SE)])

    expect(store.nameOf('x')).toBe('Sé')
  })

  it('leaves a loaded constructed station alone, even inside a marker area', () => {
    const store = createStoreDouble()
    install(store, [marker('Sé', SE)], on())

    store.build([constructed('loaded', 'Original', SE)])

    expect(store.nameOf('loaded')).toBe('Original')
  })

  it('leaves the station alone once it is a built station the player can rename', () => {
    const store = createStoreDouble([constructed('x', 'Sé', SE)])
    install(store, [marker('Sé', SE)], on())

    store.build([constructed('x', 'Renamed by player', SE)])

    expect(store.nameOf('x')).toBe('Renamed by player')
  })

  it('leaves a blueprint outside every marker area alone', () => {
    const store = createStoreDouble()
    install(store, [marker('Sé', SE)], on())

    store.build([blueprint('new', 'Rua Qualquer', FAR)])

    expect(store.nameOf('new')).toBe('Rua Qualquer')
  })

  it('does nothing while the feature is off', () => {
    const store = createStoreDouble()
    install(store, [marker('Sé', SE)], on({ nameStationsFromMarkers: false }))

    store.build([blueprint('new', 'Rua Qualquer', SE)])

    expect(store.nameOf('new')).toBe('Rua Qualquer')
  })

  it('does not double-wrap when re-wrapped on a city load', () => {
    const store = createStoreDouble()
    const { handlers } = install(store, [marker('Sé', SE)], on())
    const wrappedOnce = store.getState().setStations
    handlers.onCityLoad?.()
    expect(store.getState().setStations).toBe(wrappedOnce)
  })

  it('does nothing when there is no store handle', () => {
    const { handlers } = install(null, [marker('Sé', SE)], on())
    expect(handlers.onCityLoad).toBeUndefined()
  })

  it('commits the stations unchanged when the naming pass throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = createStoreDouble()
    const throwingMarkers = { visibleMarkers: () => {
      throw new Error('boom')
    } } as unknown as MarkerStore
    const namer = new StationNamer(
      store,
      throwingMarkers,
      settingsDouble(on()),
    )
    namer.install(createApi().api)

    expect(() => store.build([blueprint('new', 'Rua Qualquer', SE)])).not.toThrow()
    expect(store.nameOf('new')).toBe('Rua Qualquer')
    expect(warn).toHaveBeenCalled()
  })
})
