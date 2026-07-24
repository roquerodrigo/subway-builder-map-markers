import type { MarkerStore } from '@/application/MarkerStore'
import type { SubwayBuilderApi } from '@/shared/game/SubwayBuilderApi'

import { logger } from '@/shared/Logger'

// Re-sync the store to the loaded save on every hook that can change which save is
// active. onGameSaved is included because the first autosave of a brand-new game is
// when the save becomes identifiable. onGameLoaded is handled on its own below.
const SYNC_HOOKS = ['onCityLoad', 'onMapReady', 'onGameSaved']

// Wires the game's save/load lifecycle to the marker store so markers follow the
// current save. onGameInit marks a fresh game (start empty, stop reading the city cache
// so it can't inherit the previous game's markers); the sync hooks reload the store for
// whatever save is now active. onGameLoaded is late-fire — registering it re-runs it
// with the current save — so the store loads immediately even when the mod starts
// mid-game. After each sync it re-renders the map (the instance may have changed).
export class SaveScopeRegistrar {
  constructor(
    private readonly api: SubwayBuilderApi,
    private readonly store: MarkerStore,
    private readonly onSynced: () => void,
  ) {}

  install(): void {
    this.on('onGameInit', () => {
      this.store.startNewGame()
      void this.resync()
    })
    // Opening the game to the main menu fires onGameInit with no save loaded, which is
    // indistinguishable from starting a new game — so loading a save is what settles
    // it: this board is an existing one and may read the city cache again.
    this.on('onGameLoaded', () => {
      this.store.resumeSavedGame()
      void this.resync()
    })
    for (const name of SYNC_HOOKS) {
      this.on(name, () => void this.resync())
    }
  }

  // Load the current state now (the mod may start after the save already loaded and
  // late-fire hooks have run against a not-yet-installed listener).
  syncNow(): void {
    void this.resync()
  }

  private on(name: string, handler: () => void): void {
    const hooks = this.api.hooks
    const hook = hooks?.[name]
    if (typeof hook !== 'function') {
      return
    }
    try {
      // Called on `hooks` rather than detached: the game is free to implement a hook
      // as a method that needs its receiver.
      hook.call(hooks, handler)
    } catch (error) {
      // A missing hook is already handled above, so this is a real failure — and it
      // means the markers stop following the save, which is the whole job here.
      logger.warn(`could not install the ${name} hook:`, error)
    }
  }

  private async resync(): Promise<void> {
    await this.store.sync()
    this.onSynced()
  }
}
