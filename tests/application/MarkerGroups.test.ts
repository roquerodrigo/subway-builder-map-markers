import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GameStateSnapshot } from '@/shared/game/StoreCallbacks'

import { MarkerStore } from '@/application/MarkerStore'
import { MarkerRepository } from '@/infrastructure/persistence/MarkerRepository'
import { createModStorage } from '@/infrastructure/persistence/ModStorage'
import { GameSession } from '@/infrastructure/store/GameSession'

const PERSIST_DEBOUNCE_MS = 250

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

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('MarkerStore folders', () => {
  it('starts with no folders', () => {
    const { store } = createFixture()
    expect(store.groups()).toEqual([])
  })

  it('adds a folder, notifies, and returns it', () => {
    const { store } = createFixture()
    const listener = vi.fn()
    store.subscribe(listener)
    const group = store.addGroup('Line 1')
    expect(store.groups()).toEqual([group])
    expect(group.name).toBe('Line 1')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('moves a marker into a folder', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    const marker = store.add([0, 0])
    store.assignToGroup(marker.id, group.id)
    expect(store.all()[0].groupId).toBe(group.id)
  })

  it('moves a marker back out of every folder', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    const marker = store.add([0, 0])
    store.assignToGroup(marker.id, group.id)
    store.assignToGroup(marker.id, null)
    expect(store.all()[0].groupId).toBeNull()
  })

  it('ignores an assignment to a folder that does not exist', () => {
    const { store } = createFixture()
    const marker = store.add([0, 0])
    const listener = vi.fn()
    store.subscribe(listener)
    store.assignToGroup(marker.id, 'no-such-folder')
    expect(store.all()[0].groupId).toBeUndefined()
    expect(listener).not.toHaveBeenCalled()
  })

  it('renames a folder', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    store.renameGroup(group.id, 'Blue Line')
    expect(store.groups()[0].name).toBe('Blue Line')
  })

  it('ignores a rename to the same name and a rename of an unknown folder', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    const listener = vi.fn()
    store.subscribe(listener)
    store.renameGroup(group.id, 'Line 1')
    store.renameGroup('no-such-folder', 'x')
    expect(listener).not.toHaveBeenCalled()
  })

  it('removes a folder and frees its markers instead of deleting them', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    const marker = store.add([0, 0])
    store.assignToGroup(marker.id, group.id)
    store.removeGroup(group.id)
    expect(store.groups()).toEqual([])
    expect(store.all()).toHaveLength(1)
    expect(store.all()[0].groupId).toBeNull()
  })

  it('ignores removing a folder it does not know', () => {
    const { store } = createFixture()
    const listener = vi.fn()
    store.subscribe(listener)
    store.removeGroup('no-such-folder')
    expect(listener).not.toHaveBeenCalled()
  })

  it('hides and shows a folder', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    store.setGroupHidden(group.id, true)
    expect(store.groups()[0].hidden).toBe(true)
    store.toggleGroupHidden(group.id)
    expect(store.groups()[0].hidden).toBe(false)
  })

  it('ignores hiding a folder that is already in that state, and an unknown folder', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    const listener = vi.fn()
    store.subscribe(listener)
    store.setGroupHidden(group.id, false)
    store.toggleGroupHidden('no-such-folder')
    expect(listener).not.toHaveBeenCalled()
  })

  describe('visibleMarkers', () => {
    it('returns every marker when no folder is hidden', () => {
      const { store } = createFixture()
      const group = store.addGroup('Line 1')
      const marker = store.add([0, 0])
      store.assignToGroup(marker.id, group.id)
      expect(store.visibleMarkers()).toHaveLength(1)
    })

    it('drops the markers of a hidden folder but keeps ungrouped ones', () => {
      const { store } = createFixture()
      const group = store.addGroup('Line 1')
      const inFolder = store.add([0, 0])
      store.assignToGroup(inFolder.id, group.id)
      const loose = store.add([1, 1])
      store.setGroupHidden(group.id, true)
      const visible = store.visibleMarkers()
      expect(visible.map((marker) => marker.id)).toEqual([loose.id])
    })

    it('keeps a marker whose folder no longer exists visible even when another is hidden', () => {
      const { store } = createFixture()
      const hiddenGroup = store.addGroup('hidden')
      const inHidden = store.add([0, 0])
      store.assignToGroup(inHidden.id, hiddenGroup.id)
      const dangling = store.add([1, 1])
      store.update(dangling.id, { groupId: 'gone' })
      store.setGroupHidden(hiddenGroup.id, true)
      expect(store.visibleMarkers().map((marker) => marker.id)).toEqual([dangling.id])
    })
  })

  it('drops every folder when a brand-new game starts', () => {
    const { store } = createFixture()
    store.addGroup('Line 1')
    store.startNewGame()
    expect(store.groups()).toEqual([])
  })

  describe('persistence', () => {
    it('writes folders to the save bucket and the city cache', async () => {
      const { repository, state, store } = createFixture()
      playing(state, '/saves/a.metro', 'sao-paulo')
      await store.sync()
      store.addGroup('Line 1')
      await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS)
      expect(await repository.loadGroupsForSave('/saves/a.metro')).toHaveLength(1)
      expect(await repository.loadGroupsRecent('sao-paulo')).toHaveLength(1)
    })

    it('loads the folders of the loaded save alongside its markers', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveForSave('/saves/a.metro', [
        { color: '#fff', groupId: 'g1', icon: 'station', id: 'm1', label: 'A', position: [0, 0] },
      ])
      await repository.saveGroupsForSave('/saves/a.metro', [
        { color: '#0a4d9c', hidden: false, id: 'g1', name: 'Line 1' },
      ])
      playing(state, '/saves/a.metro', 'sao-paulo')
      await store.sync()
      expect(store.groups().map((group) => group.name)).toEqual(['Line 1'])
      expect(store.all()[0].groupId).toBe('g1')
    })

    it('inherits the city cache folders when the save has none of its own', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveRecent('sao-paulo', [
        { color: '#fff', icon: 'station', id: 'm1', label: 'A', position: [0, 0] },
      ])
      await repository.saveGroupsRecent('sao-paulo', [
        { color: null, hidden: false, id: 'g1', name: 'Cached' },
      ])
      playing(state, '/saves/_auto_new.metro', 'sao-paulo')
      await store.sync()
      expect(store.groups().map((group) => group.name)).toEqual(['Cached'])
    })

    it('clears the cached folders when a brand-new game starts', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveGroupsRecent('sao-paulo', [{ color: null, hidden: false, id: 'g1', name: 'Old' }])
      playing(state, '/saves/new.metro', 'sao-paulo')
      store.startNewGame()
      await store.sync()
      expect(await repository.loadGroupsRecent('sao-paulo')).toEqual([])
    })
  })
})
