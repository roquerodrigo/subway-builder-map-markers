import type { MarkerStore } from '@/application/MarkerStore'
import type { SettingsStore } from '@/application/SettingsStore'
import type { GameStation, StoreCallbacks } from '@/shared/game/StoreCallbacks'
import type { SubwayBuilderApi } from '@/shared/game/SubwayBuilderApi'

import { stationNameFromMarkers } from '@/domain/marker/StationNaming'
import { logger } from '@/shared/Logger'

// setStations functions this mod has already wrapped, so a re-run (reloadMods) or a
// re-wrap on a lifecycle hook never stacks a second wrapper on top of its own.
const wrappedActions = new WeakSet<(stations: GameStation[]) => void>()

// Names a station the player places after the marker whose influence area covers it —
// the one place the mod writes to the game's own state, and only when the player opts in
// (the "name stations from markers" setting).
//
// It wraps the store's `setStations`, which is where a station enters state: the instant
// a blueprint is placed it arrives here with buildType "blueprint" (before construction,
// which is what the player wants), and again as it flips to "constructed". The name is
// set by rewriting that station in the committed array — the game's `updateStationName`
// re-derives the name from nearby streets and ignores an arbitrary string, so it can't
// be used. A station is (re)named only while it's a fresh blueprint or crossing from
// blueprint to constructed, so loaded/constructed stations are left alone and, once
// built, the player can rename freely. Only visible markers count, matching the
// influence circles on the map.
export class StationNamer {
  constructor(
    private readonly store: null | StoreCallbacks,
    private readonly markers: MarkerStore,
    private readonly settings: SettingsStore,
  ) {}

  install(api: SubwayBuilderApi): void {
    if (!this.store) {
      return
    }
    this.wrapSetStations()
    // The store can hand back a fresh setStations across a city/game load; re-wrap
    // (idempotent — a wrapper this mod already installed is skipped).
    this.on(api, 'onCityLoad', () => this.wrapSetStations())
    this.on(api, 'onGameLoaded', () => this.wrapSetStations())
  }

  private applyNames(stations: GameStation[]): GameStation[] {
    if (!Array.isArray(stations) || !this.settings.get().nameStationsFromMarkers) {
      return stations
    }
    const radius = this.settings.get().radiusMeters
    const visible = this.markers.visibleMarkers()
    const previous = new Map((this.store?.getState().stations ?? []).map((station) => [station.id, station]))
    let changed = false
    const next = stations.map((station) => {
      const label = stationNameFromMarkers(station.coords, visible, radius)
      if (label === null || station.name === label) {
        return station
      }
      const before = previous.get(station.id)
      const isFreshBlueprint = before === undefined && station.buildType === 'blueprint'
      const leftBlueprint = before?.buildType === 'blueprint'
      if (isFreshBlueprint || leftBlueprint) {
        changed = true

        return { ...station, name: label }
      }

      return station
    })

    return changed ? next : stations
  }

  private on(api: SubwayBuilderApi, name: string, handler: () => void): void {
    const hook = api.hooks?.[name]
    if (typeof hook !== 'function') {
      return
    }
    try {
      hook.call(api.hooks, handler)
    } catch (error) {
      logger.warn(`could not install the ${name} hook:`, error)
    }
  }

  private wrapSetStations(): void {
    const state = this.store?.getState()
    const original = state?.setStations
    if (typeof original !== 'function' || wrappedActions.has(original)) {
      return
    }
    const applyNames = (stations: GameStation[]): GameStation[] => this.applyNames(stations)
    const wrapped = function (this: unknown, stations: GameStation[]): void {
      let named = stations
      try {
        named = applyNames(stations)
      } catch (error) {
        logger.warn('could not name a station from its marker:', error)
      }

      return original.call(this, named)
    }
    wrappedActions.add(wrapped)
    if (state) {
      state.setStations = wrapped
    }
  }
}
