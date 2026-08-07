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

  it('puts a marker on a folder s line', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    const first = store.add([0, 0])
    const second = store.add([1, 1])
    store.addToGroup(first.id, group.id)
    store.addToGroup(second.id, group.id)
    expect(store.groups()[0].markerIds).toEqual([first.id, second.id])
  })

  // A station joins a line between two of its stops; appending it to the end would
  // double the line back across the city.
  it('lands a new stop in the gap it belongs to, not at the end', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    const ends = [store.add([0, 0]), store.add([1, 0]), store.add([2, 0])]
    for (const marker of ends) {
      store.addToGroup(marker.id, group.id)
    }
    const between = store.add([0.5, 0])

    store.addToGroup(between.id, group.id)

    expect(store.groups()[0].markerIds).toEqual([ends[0].id, between.id, ends[1].id, ends[2].id])
  })

  it('extends the line past its terminus when the new stop is out there', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    const ends = [store.add([0, 0]), store.add([1, 0])]
    for (const marker of ends) {
      store.addToGroup(marker.id, group.id)
    }
    const beyond = store.add([2, 0])

    store.addToGroup(beyond.id, group.id)

    expect(store.groups()[0].markerIds).toEqual([ends[0].id, ends[1].id, beyond.id])
  })

  // An interchange is on every line that stops there.
  it('keeps a marker on every folder it was added to', () => {
    const { store } = createFixture()
    const one = store.addGroup('Line 1')
    const two = store.addGroup('Line 2')
    const marker = store.add([0, 0])
    store.addToGroup(marker.id, one.id)
    store.addToGroup(marker.id, two.id)
    expect(store.groups().map((group) => group.markerIds)).toEqual([[marker.id], [marker.id]])
  })

  it('takes a marker off one folder s line, leaving the others', () => {
    const { store } = createFixture()
    const one = store.addGroup('Line 1')
    const two = store.addGroup('Line 2')
    const marker = store.add([0, 0])
    store.addToGroup(marker.id, one.id)
    store.addToGroup(marker.id, two.id)
    store.removeFromGroup(marker.id, one.id)
    expect(store.groups().map((group) => group.markerIds)).toEqual([[], [marker.id]])
    expect(store.all()).toHaveLength(1)
  })

  it('ignores adding a marker twice to the same folder', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    const marker = store.add([0, 0])
    store.addToGroup(marker.id, group.id)
    const listener = vi.fn()
    store.subscribe(listener)
    store.addToGroup(marker.id, group.id)
    expect(store.groups()[0].markerIds).toEqual([marker.id])
    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores adding to a folder that does not exist', () => {
    const { store } = createFixture()
    const marker = store.add([0, 0])
    const listener = vi.fn()
    store.subscribe(listener)
    store.addToGroup(marker.id, 'no-such-folder')
    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores adding a marker that is not on the board', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    const listener = vi.fn()
    store.subscribe(listener)
    store.addToGroup('no-such-marker', group.id)
    expect(store.groups()[0].markerIds).toEqual([])
    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores taking a marker off a folder that does not hold it', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    const marker = store.add([0, 0])
    const listener = vi.fn()
    store.subscribe(listener)
    store.removeFromGroup(marker.id, group.id)
    store.removeFromGroup(marker.id, 'no-such-folder')
    expect(listener).not.toHaveBeenCalled()
  })

  it('takes a removed marker off every line it was on', () => {
    const { store } = createFixture()
    const one = store.addGroup('Line 1')
    const two = store.addGroup('Line 2')
    const marker = store.add([0, 0])
    store.addToGroup(marker.id, one.id)
    store.addToGroup(marker.id, two.id)
    store.remove(marker.id)
    expect(store.groups().map((group) => group.markerIds)).toEqual([[], []])
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
    store.addToGroup(marker.id, group.id)
    store.removeGroup(group.id)
    expect(store.groups()).toEqual([])
    expect(store.all()).toHaveLength(1)
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

  it('collapses and expands a folder', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    expect(store.groups()[0].collapsed).toBe(false)
    store.setGroupCollapsed(group.id, true)
    expect(store.groups()[0].collapsed).toBe(true)
    store.toggleGroupCollapsed(group.id)
    expect(store.groups()[0].collapsed).toBe(false)
  })

  it('ignores collapsing a folder that is already in that state, and an unknown folder', () => {
    const { store } = createFixture()
    const group = store.addGroup('Line 1')
    const listener = vi.fn()
    store.subscribe(listener)
    store.setGroupCollapsed(group.id, false)
    store.toggleGroupCollapsed('no-such-folder')
    expect(listener).not.toHaveBeenCalled()
  })

  it('persists the collapsed state to the save bucket', async () => {
    const { repository, state, store } = createFixture()
    playing(state, '/saves/a.metro', 'sao-paulo')
    await store.sync()
    const group = store.addGroup('Line 1')
    store.setGroupCollapsed(group.id, true)
    await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS)
    const saved = await repository.loadGroupsForSave('/saves/a.metro')
    expect(saved[0].collapsed).toBe(true)
  })

  // Clicking a badge on the map has to land on that marker's card in the panel, which
  // means the folder holding it can't stay folded.
  describe('reveal', () => {
    it('selects the marker and unfolds the folder holding it', () => {
      const { store } = createFixture()
      const group = store.addGroup('Line 1')
      const marker = store.add([0, 0])
      store.addToGroup(marker.id, group.id)
      store.setGroupCollapsed(group.id, true)
      store.select(null)

      store.reveal(marker.id)

      expect(store.selected()).toBe(marker.id)
      expect(store.groups()[0].collapsed).toBe(false)
    })

    it('leaves an already open folder alone', () => {
      const { store } = createFixture()
      const group = store.addGroup('Line 1')
      const marker = store.add([0, 0])
      store.addToGroup(marker.id, group.id)
      store.select(null)
      const listener = vi.fn()
      store.subscribe(listener)

      store.reveal(marker.id)

      expect(listener).toHaveBeenCalledTimes(1) // the selection, nothing else
    })

    // An interchange is on several lines; unfolding all of them would bury the card
    // that was asked for under the other folders.
    it('unfolds only the first folder of a marker on several lines', () => {
      const { store } = createFixture()
      const one = store.addGroup('Line 1')
      const two = store.addGroup('Line 2')
      const marker = store.add([0, 0])
      store.addToGroup(marker.id, one.id)
      store.addToGroup(marker.id, two.id)
      store.setGroupCollapsed(one.id, true)
      store.setGroupCollapsed(two.id, true)

      store.reveal(marker.id)

      expect(store.groups().map((group) => group.collapsed)).toEqual([false, true])
    })

    it('still selects a marker no folder holds', () => {
      const { store } = createFixture()
      const marker = store.add([0, 0])
      store.select(null)
      store.reveal(marker.id)
      expect(store.selected()).toBe(marker.id)
    })
  })

  describe('sortGroupAlongPath', () => {
    // A folder's marker order is the order the line is drawn in, so a folder filled in
    // some other order (alphabetically, say) draws a line that criss-crosses the city.
    // Fill a folder and then drag its markers into exactly `positions` order — which is
    // the mess this action exists to clean up (a board typed in alphabetical order).
    // Adding to a folder already picks the right place, so the disorder has to be made
    // on purpose.
    function fillFolder(store: MarkerStore, positions: [number, number][]): string {
      const group = store.addGroup('Line 1')
      const ids = positions.map((position, index) => {
        const marker = store.add(position)
        store.update(marker.id, { label: `stop-${index}` })
        store.addToGroup(marker.id, group.id)

        return marker.id
      })
      ids.forEach((id, index) => {
        if (index > 0) {
          store.moveMarker({ from: group.id, markerId: id, to: group.id }, { id: ids[index - 1], side: 'after' })
        }
      })

      return group.id
    }

    function sequence(store: MarkerStore, groupId: string): number[] {
      const byId = new Map(store.all().map((marker) => [marker.id, marker.position[0]]))
      const group = store.groups().find((candidate) => candidate.id === groupId)

      return (group?.markerIds ?? []).map((id) => byId.get(id) ?? Number.NaN)
    }

    it('reorders the folder along the shortest path through its markers', () => {
      const { store } = createFixture()
      const groupId = fillFolder(store, [[2, 0], [0, 0], [3, 0], [1, 0]])
      store.sortGroupAlongPath(groupId)
      expect(sequence(store, groupId)).toEqual([0, 1, 2, 3])
    })

    // Board order is what the ungrouped list draws; only the folder's own line moves.
    it('leaves board order alone', () => {
      const { store } = createFixture()
      const groupId = fillFolder(store, [[2, 0], [0, 0], [1, 0]])
      store.sortGroupAlongPath(groupId)
      expect(store.all().map((marker) => marker.position[0])).toEqual([2, 0, 1])
    })

    it('notifies and persists the new order', async () => {
      const { repository, state, store } = createFixture()
      playing(state, '/saves/a.metro', 'sao-paulo')
      await store.sync()
      const groupId = fillFolder(store, [[0, 0], [2, 0], [1, 0]])
      const listener = vi.fn()
      store.subscribe(listener)
      store.sortGroupAlongPath(groupId)
      expect(listener).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS)
      const savedMarkers = await repository.loadForSave('/saves/a.metro')
      const savedGroups = await repository.loadGroupsForSave('/saves/a.metro')
      const byId = new Map(savedMarkers.map((marker) => [marker.id, marker.position[0]]))
      expect(savedGroups[0].markerIds.map((id) => byId.get(id))).toEqual([0, 1, 2])
    })

    it('leaves the markers of every other folder where they are', () => {
      const { store } = createFixture()
      const sorted = fillFolder(store, [[2, 0], [0, 0], [1, 0]])
      const other = store.addGroup('Line 2')
      const first = store.add([9, 9])
      const second = store.add([8, 8])
      store.addToGroup(first.id, other.id)
      store.addToGroup(second.id, other.id)
      store.sortGroupAlongPath(sorted)
      expect(store.groups()[1].markerIds).toEqual([first.id, second.id])
    })

    it('sorts a line without disturbing the interchange it shares with another', () => {
      const { store } = createFixture()
      const sorted = fillFolder(store, [[0, 0], [2, 0], [1, 0]])
      const other = store.addGroup('Line 2')
      const shared = store.all()[0]
      store.addToGroup(shared.id, other.id)
      store.sortGroupAlongPath(sorted)
      expect(sequence(store, sorted)).toEqual([0, 1, 2])
      expect(store.groups()[1].markerIds).toEqual([shared.id])
    })

    it('does nothing when the folder is already in order', () => {
      const { store } = createFixture()
      const groupId = fillFolder(store, [[0, 0], [1, 0], [2, 0]])
      const listener = vi.fn()
      store.subscribe(listener)
      store.sortGroupAlongPath(groupId)
      expect(listener).not.toHaveBeenCalled()
    })

    it('does nothing for a folder that does not exist', () => {
      const { store } = createFixture()
      fillFolder(store, [[2, 0], [0, 0], [1, 0]])
      const listener = vi.fn()
      store.subscribe(listener)
      store.sortGroupAlongPath('not-a-folder')
      expect(listener).not.toHaveBeenCalled()
    })

    it('does nothing for a folder with too few markers to order', () => {
      const { store } = createFixture()
      const groupId = fillFolder(store, [[1, 0], [0, 0]])
      const listener = vi.fn()
      store.subscribe(listener)
      store.sortGroupAlongPath(groupId)
      expect(listener).not.toHaveBeenCalled()
    })

    it('skips an id whose marker is gone', () => {
      const { store } = createFixture()
      const groupId = fillFolder(store, [[0, 0], [2, 0], [1, 0], [3, 0]])
      store.remove(store.all()[3].id)
      store.sortGroupAlongPath(groupId)
      expect(sequence(store, groupId)).toEqual([0, 1, 2])
    })
  })

  describe('visibleMarkers', () => {
    it('returns every marker when no folder is hidden', () => {
      const { store } = createFixture()
      const group = store.addGroup('Line 1')
      const marker = store.add([0, 0])
      store.addToGroup(marker.id, group.id)
      expect(store.visibleMarkers()).toHaveLength(1)
    })

    it('drops the markers of a hidden folder but keeps ungrouped ones', () => {
      const { store } = createFixture()
      const group = store.addGroup('Line 1')
      const inFolder = store.add([0, 0])
      store.addToGroup(inFolder.id, group.id)
      const loose = store.add([1, 1])
      store.setGroupHidden(group.id, true)
      const visible = store.visibleMarkers()
      expect(visible.map((marker) => marker.id)).toEqual([loose.id])
    })

    it('keeps a marker whose folder no longer exists visible even when another is hidden', () => {
      const { store } = createFixture()
      const hiddenGroup = store.addGroup('hidden')
      const inHidden = store.add([0, 0])
      store.addToGroup(inHidden.id, hiddenGroup.id)
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
      ], null)
      await repository.saveGroupsForSave('/saves/a.metro', [
        { collapsed: false, color: '#0a4d9c', hidden: false, id: 'g1', markerIds: [], name: 'Line 1' },
      ], null)
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
        { collapsed: false, color: null, hidden: false, id: 'g1', markerIds: [], name: 'Cached' },
      ])
      playing(state, '/saves/_auto_new.metro', 'sao-paulo')
      await store.sync()
      expect(store.groups().map((group) => group.name)).toEqual(['Cached'])
    })

    it('does not inherit the cached folders when a brand-new game starts, and keeps them on disk', async () => {
      const { repository, state, store } = createFixture()
      await repository.saveGroupsRecent('sao-paulo', [{ collapsed: false, color: null, hidden: false, id: 'g1', markerIds: [], name: 'Old' }])
      playing(state, null, 'sao-paulo')
      store.startNewGame()
      await store.sync()
      expect(store.groups()).toEqual([])
      expect((await repository.loadGroupsRecent('sao-paulo')).map((group) => group.name)).toEqual(['Old'])
    })
  })
})
