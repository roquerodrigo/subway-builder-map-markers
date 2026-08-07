import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'

import { MarkerStore } from '@/application/MarkerStore'
import { MarkerRepository } from '@/infrastructure/persistence/MarkerRepository'
import { createModStorage } from '@/infrastructure/persistence/ModStorage'

type Session = { cityCode(): null | string, saveId(): null | string }

const PERSIST_DEBOUNCE_MS = 250

interface SessionState {
  city: null | string
  save: null | string
}

function labels(store: MarkerStore): string[] {
  return store.all().map((marker) => marker.label)
}

function makeStore(state: SessionState): MarkerStore {
  const session: Session = { cityCode: () => state.city, saveId: () => state.save }

  return new MarkerStore(new MarkerRepository(createModStorage()), session as never)
}

function storedGroup(name: string): MarkerGroup {
  return { color: null, hidden: false, id: `group-${name}`, markerIds: [], name }
}

function storedMarker(label: string): Marker {
  return { color: '#ef4444', icon: 'station', id: `id-${label}`, label, position: [-46.6, -23.5] }
}

// These pin the ways the store used to lose a player's markers. All of them are quiet
// failures — the markers vanish from a running game — so they're worth holding down
// explicitly rather than leaving to the broader sync tests.
describe('MarkerStore data loss', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()

    return () => vi.useRealTimers()
  })

  // What actually cost the player their board: the city cache was deleted from under
  // the mod (something outside it removed the key), and the game came back on a fresh
  // autosave whose own bucket is empty. Both lookups miss, and the map draws empty
  // while the board sits untouched in the bucket of the save it was drawn in.
  it('recovers the board when the city cache is gone and the reopened save has none', async () => {
    const repository = new MarkerRepository(createModStorage())
    const state: SessionState = { city: 'RMSP', save: null }
    const session: Session = { cityCode: () => state.city, saveId: () => state.save }

    await repository.saveForSave('/saves/_auto__OLD.metro', [storedMarker('Sé')], 'RMSP')
    await repository.saveGroupsForSave('/saves/_auto__OLD.metro', [storedGroup('Line 1')], 'RMSP')

    state.save = '/saves/_auto__REOPENED.metro'
    const store = new MarkerStore(repository, session as never)
    await store.sync()

    expect(labels(store)).toEqual(['Sé'])
    expect(store.groups().map((group) => group.name)).toEqual(['Line 1'])
  })

  // The recovered board is the newest one, not whichever bucket happens to be found
  // first — buckets outlive the saves that wrote them, so the storage holds a trail.
  it('recovers the newest board when several saves hold one', async () => {
    const repository = new MarkerRepository(createModStorage())
    const state: SessionState = { city: 'RMSP', save: null }
    const session: Session = { cityCode: () => state.city, saveId: () => state.save }

    await repository.saveForSave('/saves/_auto__OLDEST.metro', [storedMarker('drawn first')], 'RMSP')
    vi.advanceTimersByTime(60_000)
    await repository.saveForSave('/saves/_auto__NEWEST.metro', [storedMarker('drawn last')], 'RMSP')

    state.save = '/saves/_auto__REOPENED.metro'
    const store = new MarkerStore(repository, session as never)
    await store.sync()

    expect(labels(store)).toEqual(['drawn last'])
  })

  // The recovery reaches across saves, so it has to stop at the city line: another
  // city's board appearing on this map would be its own kind of loss.
  it('does not recover a board that belongs to another city', async () => {
    const repository = new MarkerRepository(createModStorage())
    const state: SessionState = { city: 'RMSP', save: '/saves/_auto__REOPENED.metro' }
    const session: Session = { cityCode: () => state.city, saveId: () => state.save }

    await repository.saveForSave('/saves/london.metro', [storedMarker('Waterloo')], 'LON')

    const store = new MarkerStore(repository, session as never)
    await store.sync()

    expect(labels(store)).toEqual([])
  })

  // Boards written before buckets recorded their city are the ones already on disk when
  // this recovery ships — they have to be reachable too, or the fix arrives too late
  // for the board it was written for.
  it('recovers a board saved before buckets recorded their city', async () => {
    const storage = createModStorage()
    const repository = new MarkerRepository(storage)
    const state: SessionState = { city: 'RMSP', save: '/saves/_auto__REOPENED.metro' }
    const session: Session = { cityCode: () => state.city, saveId: () => state.save }

    await storage.set('save:/saves/legacy.metro', { markers: [storedMarker('drawn long ago')], version: 1 })

    const store = new MarkerStore(repository, session as never)
    await store.sync()

    expect(labels(store)).toEqual(['drawn long ago'])
  })

  // An unlabelled bucket is a last resort, so a board that does claim this city wins.
  it('prefers a board that claims the city over an unlabelled one', async () => {
    const storage = createModStorage()
    const repository = new MarkerRepository(storage)
    const state: SessionState = { city: 'RMSP', save: '/saves/_auto__REOPENED.metro' }
    const session: Session = { cityCode: () => state.city, saveId: () => state.save }

    await storage.set('save:/saves/legacy.metro', { markers: [storedMarker('unlabelled')], version: 1 })
    await repository.saveForSave('/saves/known.metro', [storedMarker('this city')], 'RMSP')

    const store = new MarkerStore(repository, session as never)
    await store.sync()

    expect(labels(store)).toEqual(['this city'])
  })

  // A brand-new game stops reading the city cache so it can't inherit the previous
  // game's board; the recovery has to honour that same line.
  it('does not recover a board into a brand-new game', async () => {
    const repository = new MarkerRepository(createModStorage())
    const state: SessionState = { city: 'RMSP', save: null }
    const session: Session = { cityCode: () => state.city, saveId: () => state.save }

    await repository.saveForSave('/saves/previous.metro', [storedMarker('previous game')], 'RMSP')

    const store = new MarkerStore(repository, session as never)
    store.startNewGame()
    await store.sync()
    await store.sync()

    expect(labels(store)).toEqual([])
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
