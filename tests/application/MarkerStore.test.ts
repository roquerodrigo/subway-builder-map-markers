import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Marker } from '../../src/domain/marker/Marker'
import type { GameStateSnapshot } from '../../src/shared/game/StoreCallbacks'

import { MarkerStore } from '../../src/application/MarkerStore'
import { MarkerRepository } from '../../src/infrastructure/persistence/MarkerRepository'
import { createModStorage } from '../../src/infrastructure/persistence/ModStorage'
import { GameSession } from '../../src/infrastructure/store/GameSession'

const PERSIST_DEBOUNCE_MS = 250

// The store is exercised against the real repository over the real (jsdom)
// localStorage: the load order it implements is only meaningful against buckets that
// behave like the ones the game sees.
function createFixture() {
  const state: GameStateSnapshot = {}
  const session = new GameSession({}, { getState: () => state })
  const repository = new MarkerRepository(createModStorage())
  return { repository, state, store: new MarkerStore(repository, session) }
}

function playing(state: GameStateSnapshot, saveId: null | string, cityCode: null | string): void {
  state.currentSaveInfo = saveId === null ? null : { id: saveId }
  state.cityCode = cityCode ?? undefined
}

function storedMarker(label: string): Marker {
  return { id: `id-${label}`, position: [-46.6, -23.5], color: '#ef4444', icon: 'station', label }
}

function labelsOf(markers: Marker[]): string[] {
  return markers.map((marker) => marker.label)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('MarkerStore', () => {
  describe('markers', () => {
    it('starts empty with nothing selected', () => {
      const { store } = createFixture()
      expect(store.all()).toEqual([])
      expect(store.selected()).toBeNull()
    })

    it('adds a marker at the given position and selects it', () => {
      const { store } = createFixture()
      const marker = store.add([-46.6, -23.5])
      expect(store.all()).toEqual([marker])
      expect(marker.position).toEqual([-46.6, -23.5])
      expect(store.selected()).toBe(marker.id)
    })

    it('numbers the default label of a new marker by how many markers there already are', () => {
      const { store } = createFixture()
      store.add([0, 0])
      store.add([1, 1])
      expect(labelsOf(store.all())).toEqual(['Marker 1', 'Marker 2'])
    })

    it('removes the marker with the given id', () => {
      const { store } = createFixture()
      const first = store.add([0, 0])
      const second = store.add([1, 1])
      store.remove(first.id)
      expect(store.all()).toEqual([second])
    })

    it('drops the selection when the selected marker is removed', () => {
      const { store } = createFixture()
      const marker = store.add([0, 0])
      store.remove(marker.id)
      expect(store.selected()).toBeNull()
    })

    it('keeps the selection when some other marker is removed', () => {
      const { store } = createFixture()
      const first = store.add([0, 0])
      const second = store.add([1, 1])
      store.remove(first.id)
      expect(store.selected()).toBe(second.id)
    })

    it('ignores a remove of an id it does not know', () => {
      const { store } = createFixture()
      store.add([0, 0])
      const listener = vi.fn()
      store.subscribe(listener)
      store.remove('no-such-marker')
      expect(store.all()).toHaveLength(1)
      expect(listener).not.toHaveBeenCalled()
    })

    it('applies a patch to the matching marker only', () => {
      const { store } = createFixture()
      const first = store.add([0, 0])
      const second = store.add([1, 1])
      store.update(first.id, { label: 'Renamed', color: '#000000' })
      expect(store.all()).toEqual([{ ...first, label: 'Renamed', color: '#000000' }, second])
    })

    it('ignores an update of an id it does not know', () => {
      const { store } = createFixture()
      store.add([0, 0])
      const listener = vi.fn()
      store.subscribe(listener)
      store.update('no-such-marker', { label: 'Renamed' })
      expect(listener).not.toHaveBeenCalled()
    })

    it('clears every marker and the selection', () => {
      const { store } = createFixture()
      store.add([0, 0])
      store.add([1, 1])
      store.clear()
      expect(store.all()).toEqual([])
      expect(store.selected()).toBeNull()
    })

    it('ignores a clear of an already empty store', () => {
      const { store } = createFixture()
      const listener = vi.fn()
      store.subscribe(listener)
      store.clear()
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('selection', () => {
    it('selects a marker by id', () => {
      const { store } = createFixture()
      const first = store.add([0, 0])
      store.add([1, 1])
      store.select(first.id)
      expect(store.selected()).toBe(first.id)
    })

    it('clears the selection when selecting nothing', () => {
      const { store } = createFixture()
      store.add([0, 0])
      store.select(null)
      expect(store.selected()).toBeNull()
    })

    it('notifies when the selection changes', () => {
      const { store } = createFixture()
      store.add([0, 0])
      const listener = vi.fn()
      store.subscribe(listener)
      store.select(null)
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('ignores a select of the already selected marker', () => {
      const { store } = createFixture()
      const marker = store.add([0, 0])
      const listener = vi.fn()
      store.subscribe(listener)
      store.select(marker.id)
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('subscribers', () => {
    it('notifies every subscriber on a mutation', () => {
      const { store } = createFixture()
      const first = vi.fn()
      const second = vi.fn()
      store.subscribe(first)
      store.subscribe(second)
      store.add([0, 0])
      expect(first).toHaveBeenCalledTimes(1)
      expect(second).toHaveBeenCalledTimes(1)
    })

    it('stops notifying a subscriber that unsubscribed', () => {
      const { store } = createFixture()
      const listener = vi.fn()
      store.subscribe(listener)()
      store.add([0, 0])
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('persistence', () => {
    it('writes the markers to both the save bucket and the city cache', async () => {
      const { repository, state, store } = createFixture()
      playing(state, '/saves/a.metro', 'sao-paulo')
      await store.sync()
      store.add([-46.6, -23.5])
      await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS)
      expect(await repository.loadForSave('/saves/a.metro')).toHaveLength(1)
      expect(await repository.loadRecent('sao-paulo')).toHaveLength(1)
    })

    it('does not write before the debounce window has passed', async () => {
      const { repository, state, store } = createFixture()
      playing(state, '/saves/a.metro', 'sao-paulo')
      await store.sync()
      const saveForSave = vi.spyOn(repository, 'saveForSave')
      store.add([0, 0])
      await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS - 1)
      expect(saveForSave).not.toHaveBeenCalled()
    })

    it('coalesces the burst of updates a drag produces into one write per bucket', async () => {
      const { repository, state, store } = createFixture()
      playing(state, '/saves/a.metro', 'sao-paulo')
      await store.sync()
      const marker = store.add([0, 0])
      const saveForSave = vi.spyOn(repository, 'saveForSave')
      const saveRecent = vi.spyOn(repository, 'saveRecent')
      for (const longitude of [1, 2, 3, 4]) {
        store.update(marker.id, { position: [longitude, 0] })
      }
      await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS)
      expect(saveForSave).toHaveBeenCalledTimes(1)
      expect(saveRecent).toHaveBeenCalledTimes(1)
      expect(await repository.loadForSave('/saves/a.metro')).toEqual([
        { ...marker, position: [4, 0] },
      ])
    })

    it('persists a clear, so an emptied board does not come back', async () => {
      const { repository, state, store } = createFixture()
      playing(state, '/saves/a.metro', 'sao-paulo')
      await store.sync()
      store.add([0, 0])
      await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS)
      store.clear()
      await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS)
      expect(await repository.loadForSave('/saves/a.metro')).toEqual([])
      expect(await repository.loadRecent('sao-paulo')).toEqual([])
    })

    it('writes only the city cache while the game has no identifiable save yet', async () => {
      const { repository, state, store } = createFixture()
      playing(state, null, 'sao-paulo')
      await store.sync()
      const saveForSave = vi.spyOn(repository, 'saveForSave')
      store.add([0, 0])
      await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS)
      expect(saveForSave).not.toHaveBeenCalled()
      expect(await repository.loadRecent('sao-paulo')).toHaveLength(1)
    })

    it('writes nothing when neither the save nor the city is known', async () => {
      const { repository, state, store } = createFixture()
      playing(state, null, null)
      await store.sync()
      const saveForSave = vi.spyOn(repository, 'saveForSave')
      const saveRecent = vi.spyOn(repository, 'saveRecent')
      store.add([0, 0])
      await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS)
      expect(saveForSave).not.toHaveBeenCalled()
      expect(saveRecent).not.toHaveBeenCalled()
    })
  })

  describe('sync', () => {
    it('loads the markers of the loaded save', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveForSave('/saves/a.metro', [storedMarker('own')])
      playing(state, '/saves/a.metro', 'sao-paulo')
      await store.sync()
      expect(labelsOf(store.all())).toEqual(['own'])
    })

    it('falls back to the city cache when the loaded save has no markers of its own', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveRecent('sao-paulo', [storedMarker('cached')])
      playing(state, '/saves/_auto_new.metro', 'sao-paulo')
      await store.sync()
      expect(labelsOf(store.all())).toEqual(['cached'])
    })

    it('prefers the markers of the loaded save over the city cache', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveForSave('/saves/a.metro', [storedMarker('own')])
      await repository.saveRecent('sao-paulo', [storedMarker('cached')])
      playing(state, '/saves/a.metro', 'sao-paulo')
      await store.sync()
      expect(labelsOf(store.all())).toEqual(['own'])
    })

    it('falls back to the city cache when no save is identifiable yet', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveRecent('sao-paulo', [storedMarker('cached')])
      playing(state, null, 'sao-paulo')
      await store.sync()
      expect(labelsOf(store.all())).toEqual(['cached'])
    })

    it('loads nothing when neither bucket holds markers', async () => {
      const { state, store } = createFixture()
      playing(state, '/saves/a.metro', 'sao-paulo')
      await store.sync()
      expect(store.all()).toEqual([])
    })

    it('loads nothing when neither the save nor the city is known', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveRecent('sao-paulo', [storedMarker('cached')])
      playing(state, null, null)
      await store.sync()
      expect(store.all()).toEqual([])
    })

    it('seeds the bucket of the loaded save with the city cache it inherited', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveRecent('sao-paulo', [storedMarker('cached')])
      playing(state, '/saves/_auto_new.metro', 'sao-paulo')
      await store.sync()
      await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS)
      expect(labelsOf(await repository.loadForSave('/saves/_auto_new.metro'))).toEqual(['cached'])
    })

    it('drops the selection when it reloads', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveForSave('/saves/a.metro', [storedMarker('own')])
      playing(state, '/saves/a.metro', 'sao-paulo')
      store.add([0, 0])
      await store.sync()
      expect(store.selected()).toBeNull()
    })

    it('notifies its subscribers once the markers are loaded', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveForSave('/saves/a.metro', [storedMarker('own')])
      playing(state, '/saves/a.metro', 'sao-paulo')
      const listener = vi.fn()
      store.subscribe(listener)
      await store.sync()
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('does not reload when nothing about the active game changed', async () => {
      const { repository, state, store } = createFixture()
      playing(state, '/saves/a.metro', 'sao-paulo')
      await store.sync()
      const loadForSave = vi.spyOn(repository, 'loadForSave')
      await store.sync()
      expect(loadForSave).not.toHaveBeenCalled()
    })

    it('does not reload when nothing changed and neither the save nor the city is known', async () => {
      const { repository, state, store } = createFixture()
      playing(state, null, null)
      await store.sync()
      store.add([0, 0])
      const loadRecent = vi.spyOn(repository, 'loadRecent')
      await store.sync()
      expect(loadRecent).not.toHaveBeenCalled()
      expect(store.all()).toHaveLength(1)
    })

    it('reloads when the loaded save changes', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveForSave('/saves/a.metro', [storedMarker('from a')])
      await repository.saveForSave('/saves/b.metro', [storedMarker('from b')])
      playing(state, '/saves/a.metro', 'sao-paulo')
      await store.sync()
      playing(state, '/saves/b.metro', 'sao-paulo')
      await store.sync()
      expect(labelsOf(store.all())).toEqual(['from b'])
    })

    it('reloads when the city changes', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveRecent('rio', [storedMarker('from rio')])
      playing(state, null, 'sao-paulo')
      await store.sync()
      playing(state, null, 'rio')
      await store.sync()
      expect(labelsOf(store.all())).toEqual(['from rio'])
    })

    it('ignores a load that a newer sync superseded', async () => {
      const { repository, state, store } = createFixture()
      let finishFirstLoad!: (markers: Marker[]) => void
      vi.spyOn(repository, 'loadForSave')
        .mockImplementationOnce(() => new Promise<Marker[]>((resolve) => {
          finishFirstLoad = resolve
        }))
        .mockImplementationOnce(() => Promise.resolve([storedMarker('from b')]))

      playing(state, '/saves/a.metro', 'sao-paulo')
      const supersededSync = store.sync()
      playing(state, '/saves/b.metro', 'sao-paulo')
      await store.sync()
      finishFirstLoad([storedMarker('from a')])
      await supersededSync

      expect(labelsOf(store.all())).toEqual(['from b'])
    })
  })

  describe('a brand-new game', () => {
    it('starts empty even though the previous game left markers behind', () => {
      const { store } = createFixture()
      store.add([0, 0])
      const listener = vi.fn()
      store.subscribe(listener)
      store.startNewGame()
      expect(store.all()).toEqual([])
      expect(store.selected()).toBeNull()
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('clears the city cache, so it cannot inherit the previous game markers', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveRecent('sao-paulo', [storedMarker('previous game')])
      playing(state, '/saves/new.metro', 'sao-paulo')
      store.startNewGame()
      await store.sync()
      expect(store.all()).toEqual([])
      expect(await repository.loadRecent('sao-paulo')).toEqual([])
    })

    it('ignores the markers the save file it opens may already hold', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveForSave('/saves/new.metro', [storedMarker('previous game')])
      playing(state, '/saves/new.metro', 'sao-paulo')
      store.startNewGame()
      await store.sync()
      expect(store.all()).toEqual([])
    })

    // onGameInit can fire before the city is known. The reset has to stay pending
    // until a city shows up: consuming it on the first sync would let the next one
    // inherit the previous game's markers from the cache it never got to clear.
    it('holds the reset pending until the city is known, then clears the city cache', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveRecent('sao-paulo', [storedMarker('previous game')])
      playing(state, null, null)
      store.startNewGame()

      await store.sync()
      expect(store.all()).toEqual([])

      playing(state, null, 'sao-paulo')
      await store.sync()
      expect(store.all()).toEqual([])
      expect(await repository.loadRecent('sao-paulo')).toEqual([])
    })

    it('stops being a new game once the city is known', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveRecent('rio', [storedMarker('from rio')])
      playing(state, null, 'sao-paulo')
      store.startNewGame()
      await store.sync()

      playing(state, null, 'rio')
      await store.sync()
      expect(labelsOf(store.all())).toEqual(['from rio'])
    })

    it('keeps the markers placed before the first autosave made the game identifiable', async () => {
      const { repository, state, store } = createFixture()
      playing(state, null, 'sao-paulo')
      store.startNewGame()
      await store.sync()

      store.add([-46.6, -23.5])
      await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS)

      playing(state, '/saves/_auto_1.metro', 'sao-paulo')
      await store.sync()
      await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS)

      expect(store.all()).toHaveLength(1)
      expect(await repository.loadForSave('/saves/_auto_1.metro')).toHaveLength(1)
    })
  })
})
