import type { Mock } from 'vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SubwayBuilderApi } from '@/shared/game/SubwayBuilderApi'

import { MarkerStore } from '@/application/MarkerStore'
import { MarkerRepository } from '@/infrastructure/persistence/MarkerRepository'
import { createModStorage } from '@/infrastructure/persistence/ModStorage'
import { SaveScopeRegistrar } from '@/infrastructure/save/SaveScopeRegistrar'
import { GameSession } from '@/infrastructure/store/GameSession'

type GameHooks = NonNullable<SubwayBuilderApi['hooks']>

const SYNC_HOOKS = ['onGameLoaded', 'onCityLoad', 'onMapReady', 'onGameSaved']
const ALL_HOOKS = ['onGameInit', ...SYNC_HOOKS]

interface HookRecorder {
  hooks: GameHooks
  registered: Map<string, (arg?: string) => void>
}

function recordHooks(names: string[] = ALL_HOOKS): HookRecorder {
  const registered = new Map<string, (arg?: string) => void>()
  const hooks: GameHooks = {}
  for (const name of names) {
    hooks[name] = (callback) => {
      registered.set(name, callback)
    }
  }
  return { hooks, registered }
}

function createStoreSpies() {
  const store = new MarkerStore(new MarkerRepository(createModStorage()), new GameSession({}, null))
  return {
    store,
    startNewGame: vi.spyOn(store, 'startNewGame').mockImplementation(() => {}),
    sync: vi.spyOn(store, 'sync').mockResolvedValue(undefined),
  }
}

let fixture: ReturnType<typeof createStoreSpies>
let onSynced: Mock<() => void>

beforeEach(() => {
  fixture = createStoreSpies()
  onSynced = vi.fn<() => void>()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SaveScopeRegistrar', () => {
  it('registers a callback for the fresh-game hook and for every hook that can change the save', () => {
    const { hooks, registered } = recordHooks()
    new SaveScopeRegistrar({ hooks }, fixture.store, onSynced).install()
    expect([...registered.keys()]).toEqual(ALL_HOOKS)
  })

  it('does nothing when the game exposes no hooks at all', () => {
    expect(() => new SaveScopeRegistrar({}, fixture.store, onSynced).install()).not.toThrow()
    expect(fixture.sync).not.toHaveBeenCalled()
  })

  it('registers what it can when the game exposes only some of the hooks', () => {
    const { hooks, registered } = recordHooks(['onGameLoaded'])
    new SaveScopeRegistrar({ hooks }, fixture.store, onSynced).install()
    expect([...registered.keys()]).toEqual(['onGameLoaded'])
  })

  it('keeps registering the remaining hooks when one throws on registration', () => {
    const { hooks, registered } = recordHooks()
    hooks.onGameInit = () => {
      throw new Error('hook rejected the listener')
    }
    expect(() => new SaveScopeRegistrar({ hooks }, fixture.store, onSynced).install()).not.toThrow()
    expect([...registered.keys()]).toEqual(SYNC_HOOKS)
  })

  it('starts a new game and re-syncs when the game initializes', async () => {
    const { hooks, registered } = recordHooks()
    new SaveScopeRegistrar({ hooks }, fixture.store, onSynced).install()
    registered.get('onGameInit')?.()
    expect(fixture.startNewGame).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(fixture.sync).toHaveBeenCalledTimes(1)
      expect(onSynced).toHaveBeenCalledTimes(1)
    })
  })

  it.each(SYNC_HOOKS)('reloads the markers of the active save when %s fires', async (name) => {
    const { hooks, registered } = recordHooks()
    new SaveScopeRegistrar({ hooks }, fixture.store, onSynced).install()
    registered.get(name)?.('a save name')
    await vi.waitFor(() => {
      expect(fixture.sync).toHaveBeenCalledTimes(1)
      expect(onSynced).toHaveBeenCalledTimes(1)
    })
    expect(fixture.startNewGame).not.toHaveBeenCalled()
  })

  it('re-renders the map only once the store has finished loading', async () => {
    const { hooks, registered } = recordHooks()
    let finishSync = (): void => {}
    fixture.sync.mockImplementation(() => new Promise<void>((resolve) => {
      finishSync = resolve
    }))
    new SaveScopeRegistrar({ hooks }, fixture.store, onSynced).install()
    registered.get('onGameLoaded')?.()
    expect(onSynced).not.toHaveBeenCalled()
    finishSync()
    await vi.waitFor(() => {
      expect(onSynced).toHaveBeenCalledTimes(1)
    })
  })

  it('loads the already-active save on syncNow, for a mod that starts mid-game', async () => {
    new SaveScopeRegistrar({}, fixture.store, onSynced).syncNow()
    await vi.waitFor(() => {
      expect(fixture.sync).toHaveBeenCalledTimes(1)
      expect(onSynced).toHaveBeenCalledTimes(1)
    })
    expect(fixture.startNewGame).not.toHaveBeenCalled()
  })
})
