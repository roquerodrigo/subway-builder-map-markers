import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MarkerDrop } from '@/application/MarkerStore'
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

// A drag that started and ended outside every folder.
function loose(markerId: string): MarkerDrop {
  return { from: null, markerId, to: null }
}

// The labels of a folder's line, in the order it runs through them.
function sequence(store: MarkerStore, groupId: string): string[] {
  const byId = new Map(store.all().map((marker) => [marker.id, marker.label]))
  const group = store.groups().find((candidate) => candidate.id === groupId)

  return (group?.markerIds ?? []).map((id) => byId.get(id) ?? id)
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

describe('MarkerStore ordering the ungrouped list', () => {
  // Outside every folder there is no sequence of its own: the list is whatever no
  // folder claims, in board order, so a drop there reorders the board.
  it('moves a marker in front of another', () => {
    const { ids, store } = withMarkers('a', 'b', 'c')
    store.moveMarker(loose(ids.c), { id: ids.a, side: 'before' })
    expect(labels(store)).toEqual(['c', 'a', 'b'])
  })

  it('moves a marker behind another', () => {
    const { ids, store } = withMarkers('a', 'b', 'c')
    store.moveMarker(loose(ids.a), { id: ids.c, side: 'after' })
    expect(labels(store)).toEqual(['b', 'c', 'a'])
  })

  it('notifies listeners when the order changes', () => {
    const { ids, store } = withMarkers('a', 'b')
    const listener = vi.fn()
    store.subscribe(listener)
    store.moveMarker(loose(ids.b), { id: ids.a, side: 'before' })
    expect(listener).toHaveBeenCalled()
  })

  // Dropping a marker where it already sits is the most common miss of the gesture; it
  // shouldn't cost a notify or a write.
  it('stays quiet when the drop changes nothing', () => {
    const { ids, store } = withMarkers('a', 'b')
    const listener = vi.fn()
    store.subscribe(listener)
    store.moveMarker(loose(ids.a), { id: ids.a, side: 'before' })
    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores a drop involving a marker that is gone', () => {
    const { ids, store } = withMarkers('a', 'b')
    store.moveMarker(loose('ghost'), { id: ids.a, side: 'before' })
    store.moveMarker(loose(ids.a), { id: 'ghost', side: 'after' })
    expect(labels(store)).toEqual(['a', 'b'])
  })

  it('ignores a drop with nothing to land next to', () => {
    const { ids, store } = withMarkers('a', 'b')
    store.moveMarker(loose(ids.b))
    expect(labels(store)).toEqual(['a', 'b'])
  })
})

describe('MarkerStore ordering a folder s line', () => {
  it('reorders the folder without touching board order', () => {
    const { ids, store } = withMarkers('a', 'b', 'c')
    const line = store.addGroup('Line 1')
    for (const name of ['a', 'b', 'c']) {
      store.addToGroup(ids[name], line.id)
    }

    store.moveMarker({ from: line.id, markerId: ids.c, to: line.id }, { id: ids.a, side: 'before' })

    expect(sequence(store, line.id)).toEqual(['c', 'a', 'b'])
    expect(labels(store)).toEqual(['a', 'b', 'c'])
  })

  it('drops a marker behind another', () => {
    const { ids, store } = withMarkers('a', 'b')
    const line = store.addGroup('Line 1')
    store.addToGroup(ids.a, line.id)
    store.addToGroup(ids.b, line.id)

    store.moveMarker({ from: line.id, markerId: ids.a, to: line.id }, { id: ids.b, side: 'after' })

    expect(sequence(store, line.id)).toEqual(['b', 'a'])
  })

  it('stays quiet when the drop changes nothing', () => {
    const { ids, store } = withMarkers('a', 'b')
    const line = store.addGroup('Line 1')
    store.addToGroup(ids.a, line.id)
    store.addToGroup(ids.b, line.id)
    const listener = vi.fn()
    store.subscribe(listener)

    store.moveMarker({ from: line.id, markerId: ids.b, to: line.id }, { id: ids.a, side: 'after' })

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('MarkerStore moving a marker between folders', () => {
  // A drag moves: the marker leaves the line it was dragged out of and joins the one it
  // was dropped into, at the place it was dropped. Putting it on a second line without
  // leaving the first is what the card s folder chips are for.
  it('takes the marker off the folder it was dragged out of', () => {
    const { ids, store } = withMarkers('a', 'b')
    const one = store.addGroup('Line 1')
    const two = store.addGroup('Line 2')
    store.addToGroup(ids.a, one.id)
    store.addToGroup(ids.b, two.id)

    store.moveMarker({ from: one.id, markerId: ids.a, to: two.id }, { id: ids.b, side: 'before' })

    expect(sequence(store, one.id)).toEqual([])
    expect(sequence(store, two.id)).toEqual(['a', 'b'])
  })

  it('appends the marker when it was dropped on the folder itself', () => {
    const { ids, store } = withMarkers('a', 'b')
    const line = store.addGroup('Line 1')
    store.addToGroup(ids.b, line.id)

    store.moveMarker({ from: null, markerId: ids.a, to: line.id })

    expect(sequence(store, line.id)).toEqual(['b', 'a'])
  })

  it('takes a marker out of its folder when dropped on the ungrouped list', () => {
    const { ids, store } = withMarkers('a')
    const line = store.addGroup('Line 1')
    store.addToGroup(ids.a, line.id)

    store.moveMarker({ from: line.id, markerId: ids.a, to: null })

    expect(sequence(store, line.id)).toEqual([])
  })

  // The marker stays on every other line it is on: only the folder it was dragged out
  // of loses it.
  it('leaves the other lines of an interchange alone', () => {
    const { ids, store } = withMarkers('a')
    const one = store.addGroup('Line 1')
    const two = store.addGroup('Line 2')
    store.addToGroup(ids.a, one.id)
    store.addToGroup(ids.a, two.id)

    store.moveMarker({ from: one.id, markerId: ids.a, to: null })

    expect(sequence(store, one.id)).toEqual([])
    expect(sequence(store, two.id)).toEqual(['a'])
  })

  // A folder that no longer exists must not swallow the marker.
  it('ignores a folder it does not know', () => {
    const { ids, store } = withMarkers('a')
    const line = store.addGroup('Line 1')
    store.moveMarker({ from: null, markerId: ids.a, to: 'ghost-folder' })
    expect(sequence(store, line.id)).toEqual([])
  })

  it('ignores a marker that is gone', () => {
    const { store } = withMarkers('a')
    const line = store.addGroup('Line 1')
    store.moveMarker({ from: null, markerId: 'ghost', to: line.id })
    expect(sequence(store, line.id)).toEqual([])
  })

  it('stays quiet when the marker is already the last of that folder', () => {
    const { ids, store } = withMarkers('a')
    const line = store.addGroup('Line 1')
    store.addToGroup(ids.a, line.id)
    const listener = vi.fn()
    store.subscribe(listener)

    store.moveMarker({ from: line.id, markerId: ids.a, to: line.id })

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
    store.addToGroup(ids.a, one.id)
    store.addToGroup(ids.b, two.id)

    store.moveGroup(two.id, one.id, 'before')

    expect(sequence(store, one.id)).toEqual(['a'])
    expect(sequence(store, two.id)).toEqual(['b'])
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
