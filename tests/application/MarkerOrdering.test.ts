import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GameStateSnapshot } from '@/shared/game/StoreCallbacks'

import { MarkerStore } from '@/application/MarkerStore'
import { MarkerRepository } from '@/infrastructure/persistence/MarkerRepository'
import { createModStorage } from '@/infrastructure/persistence/ModStorage'
import { GameSession } from '@/infrastructure/store/GameSession'

function createFixture() {
  const state: GameStateSnapshot = {}
  const session = new GameSession({}, { getState: () => state })

  return new MarkerStore(new MarkerRepository(createModStorage()), session)
}

// Markers come back in board order, which is what the panel draws.
function labels(store: MarkerStore): string[] {
  return store.all().map((marker) => marker.label)
}

function withMarkers(...names: string[]): { ids: Record<string, string>, store: MarkerStore } {
  const store = createFixture()
  const ids: Record<string, string> = {}
  for (const name of names) {
    const marker = store.add([0, 0])
    store.update(marker.id, { label: name })
    ids[name] = marker.id
  }

  return { ids, store }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('MarkerStore marker ordering', () => {
  it('moves a marker in front of another', () => {
    const { ids, store } = withMarkers('a', 'b', 'c')
    store.moveMarker(ids.c, ids.a, 'before')
    expect(labels(store)).toEqual(['c', 'a', 'b'])
  })

  it('moves a marker behind another', () => {
    const { ids, store } = withMarkers('a', 'b', 'c')
    store.moveMarker(ids.a, ids.c, 'after')
    expect(labels(store)).toEqual(['b', 'c', 'a'])
  })

  it('notifies listeners when the order changes', () => {
    const { ids, store } = withMarkers('a', 'b')
    const listener = vi.fn()
    store.subscribe(listener)
    store.moveMarker(ids.b, ids.a, 'before')
    expect(listener).toHaveBeenCalled()
  })

  // Dropping a marker where it already sits is the most common miss of the gesture; it
  // shouldn't cost a notify or a write.
  it('stays quiet when the drop changes nothing', () => {
    const { ids, store } = withMarkers('a', 'b')
    const listener = vi.fn()
    store.subscribe(listener)
    store.moveMarker(ids.a, ids.a, 'before')
    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores a drop involving a marker that is gone', () => {
    const { ids, store } = withMarkers('a', 'b')
    store.moveMarker('ghost', ids.a, 'before')
    store.moveMarker(ids.a, 'ghost', 'after')
    expect(labels(store)).toEqual(['a', 'b'])
  })
})

describe('MarkerStore marker ordering across folders', () => {
  // Reordering inside a folder and moving between folders are one gesture, so a marker
  // dropped on a card in another folder joins that folder — otherwise it would land in
  // the right place on screen while still belonging somewhere else.
  it('adopts the folder of the marker it was dropped next to', () => {
    const { ids, store } = withMarkers('a', 'b')
    const line = store.addGroup('Line 1')
    store.assignToGroup(ids.b, line.id)

    store.moveMarker(ids.a, ids.b, 'after')

    expect(store.all().find((marker) => marker.id === ids.a)?.groupId).toBe(line.id)
  })

  it('leaves a folder when dropped next to a marker outside every folder', () => {
    const { ids, store } = withMarkers('a', 'b')
    const line = store.addGroup('Line 1')
    store.assignToGroup(ids.a, line.id)

    store.moveMarker(ids.a, ids.b, 'before')

    expect(store.all().find((marker) => marker.id === ids.a)?.groupId).toBeNull()
  })

  // The position is already right when a marker is dropped next to one of its own
  // neighbours; only the folder changed, and that still has to be committed.
  it('commits a folder change even when the order is unchanged', () => {
    const { ids, store } = withMarkers('a', 'b')
    const line = store.addGroup('Line 1')
    store.assignToGroup(ids.b, line.id)

    store.moveMarker(ids.a, ids.b, 'before')

    expect(store.all().find((marker) => marker.id === ids.a)?.groupId).toBe(line.id)
    expect(labels(store)).toEqual(['a', 'b'])
  })
})

describe('MarkerStore dropping a marker on a folder', () => {
  it('appends the marker to that folder', () => {
    const { ids, store } = withMarkers('a', 'b', 'c')
    const line = store.addGroup('Line 1')
    store.assignToGroup(ids.b, line.id)

    store.moveMarkerToGroup(ids.a, line.id)

    expect(store.all().find((marker) => marker.id === ids.a)?.groupId).toBe(line.id)
    expect(labels(store)).toEqual(['b', 'a', 'c'])
  })

  it('takes a marker out of every folder with null', () => {
    const { ids, store } = withMarkers('a')
    const line = store.addGroup('Line 1')
    store.assignToGroup(ids.a, line.id)

    store.moveMarkerToGroup(ids.a, null)

    expect(store.all()[0].groupId).toBeNull()
  })

  // A folder that no longer exists must not orphan the marker into it.
  it('ignores a folder it does not know', () => {
    const { ids, store } = withMarkers('a')
    store.moveMarkerToGroup(ids.a, 'ghost-folder')
    expect(store.all()[0].groupId).toBeUndefined()
  })

  it('ignores a marker that is gone', () => {
    const { store } = withMarkers('a')
    const line = store.addGroup('Line 1')
    store.moveMarkerToGroup('ghost', line.id)
    expect(labels(store)).toEqual(['a'])
  })

  it('stays quiet when the marker is already the last of that folder', () => {
    const { ids, store } = withMarkers('a')
    const line = store.addGroup('Line 1')
    store.assignToGroup(ids.a, line.id)
    const listener = vi.fn()
    store.subscribe(listener)

    store.moveMarkerToGroup(ids.a, line.id)

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('MarkerStore folder ordering', () => {
  it('moves a folder in front of another', () => {
    const store = createFixture()
    const one = store.addGroup('Line 1')
    const two = store.addGroup('Line 2')
    const three = store.addGroup('Line 3')

    store.moveGroup(three.id, one.id, 'before')

    expect(store.groups().map((group) => group.id)).toEqual([three.id, one.id, two.id])
  })

  it('moves a folder behind another', () => {
    const store = createFixture()
    const one = store.addGroup('Line 1')
    const two = store.addGroup('Line 2')

    store.moveGroup(one.id, two.id, 'after')

    expect(store.groups().map((group) => group.name)).toEqual(['Line 2', 'Line 1'])
  })

  it('keeps each folder s markers with it', () => {
    const { ids, store } = withMarkers('a', 'b')
    const one = store.addGroup('Line 1')
    const two = store.addGroup('Line 2')
    store.assignToGroup(ids.a, one.id)
    store.assignToGroup(ids.b, two.id)

    store.moveGroup(two.id, one.id, 'before')

    expect(store.all().find((marker) => marker.id === ids.a)?.groupId).toBe(one.id)
    expect(store.all().find((marker) => marker.id === ids.b)?.groupId).toBe(two.id)
  })

  it('stays quiet when the drop changes nothing', () => {
    const store = createFixture()
    const one = store.addGroup('Line 1')
    const listener = vi.fn()
    store.subscribe(listener)

    store.moveGroup(one.id, one.id, 'before')

    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores a folder that is gone', () => {
    const store = createFixture()
    const one = store.addGroup('Line 1')
    store.moveGroup('ghost', one.id, 'before')
    expect(store.groups()).toHaveLength(1)
  })
})
