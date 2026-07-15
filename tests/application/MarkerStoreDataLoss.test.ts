import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MarkerStore } from '@/application/MarkerStore'
import { MarkerRepository } from '@/infrastructure/persistence/MarkerRepository'
import { createModStorage } from '@/infrastructure/persistence/ModStorage'

type Session = { cityCode(): null | string, saveId(): null | string }

const PERSIST_DEBOUNCE_MS = 250

interface SessionState {
  city: null | string
  save: null | string
}

function makeStore(state: SessionState): MarkerStore {
  const session: Session = { cityCode: () => state.city, saveId: () => state.save }
  return new MarkerStore(new MarkerRepository(createModStorage()), session as never)
}

function labels(store: MarkerStore): string[] {
  return store.all().map((marker) => marker.label)
}

// These pin the two ways the store used to lose a player's markers. Both are quiet
// failures — the markers vanish from a running game — so they're worth holding down
// explicitly rather than leaving to the broader sync tests.
describe('MarkerStore data loss', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    return () => vi.useRealTimers()
  })

  // A new game whose city never resolves (both city sources are optional and may be
  // absent) used to keep the fresh-game flag set forever, so every later sync
  // re-emptied the store — and a sync runs on every autosave.
  it('keeps the markers of a new game whose city never resolves', async () => {
    const state: SessionState = { city: null, save: null }
    const store = makeStore(state)
    store.startNewGame()
    await store.sync()

    store.add([-46.6, -23.6])
    store.update(store.all()[0].id, { label: 'drawn without a city' })
    expect(labels(store)).toEqual(['drawn without a city'])

    state.save = '/saves/_auto__FIRST.metro'
    await store.sync()
    await store.sync()
    await store.sync()

    expect(labels(store)).toEqual(['drawn without a city'])
  })

  // The first autosave of a new game assigns a save id, which makes sync() reload —
  // and an edit still inside the 250ms debounce hadn't reached the buckets yet.
  it('keeps an edit made within the debounce window when a sync lands on top of it', async () => {
    const state: SessionState = { city: 'RMSP', save: null }
    const store = makeStore(state)
    store.startNewGame()
    await store.sync()

    store.add([-46.6, -23.6])
    store.update(store.all()[0].id, { label: 'renamed just now' })

    state.save = '/saves/_auto__FIRST.metro'
    await store.sync()

    expect(labels(store)).toEqual(['renamed just now'])
  })

  // The follow-on: the reverted state used to be persisted over the good bucket by
  // the next edit, making the loss permanent rather than a redraw away from fixed.
  it('does not persist a reverted state over the saved markers', async () => {
    const repository = new MarkerRepository(createModStorage())
    const state: SessionState = { city: 'RMSP', save: '/saves/game.metro' }
    const session: Session = { cityCode: () => state.city, saveId: () => state.save }
    const store = new MarkerStore(repository, session as never)

    await store.sync()
    store.add([-46.6, -23.6])
    store.update(store.all()[0].id, { label: 'keep me' })
    await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS)

    store.update(store.all()[0].id, { label: 'renamed within the window' })
    await store.sync()
    await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS)

    expect(labels(store)).toEqual(['renamed within the window'])
    const stored = await repository.loadForSave('/saves/game.metro')
    expect(stored.map((marker) => marker.label)).toEqual(['renamed within the window'])
  })
})
