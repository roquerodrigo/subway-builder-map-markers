import { describe, expect, it } from 'vitest'

import type { ModStorage } from '@/infrastructure/persistence/ModStorage'

import { withLegacyReads } from '@/infrastructure/persistence/LegacyBackedStorage'

function memoryStorage(entries: Record<string, unknown> = {}): ModStorage & { entries: Map<string, unknown> } {
  const map = new Map<string, unknown>(Object.entries(entries))

  return {
    delete: (key) => {
      map.delete(key)

      return Promise.resolve()
    },
    entries: map,
    get: <T>(key: string, fallback: T): Promise<T> => Promise.resolve(map.has(key) ? (map.get(key) as T) : fallback),
    keys: () => Promise.resolve([...map.keys()]),
    set: (key, value) => {
      map.set(key, value)

      return Promise.resolve()
    },
  }
}

describe('withLegacyReads', () => {
  it('reads from the new home when it has the key', async () => {
    const storage = withLegacyReads(memoryStorage({ board: 'new' }), memoryStorage({ board: 'old' }))
    expect(await storage.get('board', null)).toBe('new')
  })

  it('falls through to the legacy home for a key written before the move', async () => {
    const storage = withLegacyReads(memoryStorage(), memoryStorage({ board: 'old' }))
    expect(await storage.get('board', null)).toBe('old')
  })

  it('returns the fallback when neither home has the key', async () => {
    const storage = withLegacyReads(memoryStorage(), memoryStorage())
    expect(await storage.get('board', 'fallback')).toBe('fallback')
  })

  // A stored `false` is a value, not a miss — reading it as one would send every lookup
  // to the legacy home and quietly resurrect what was there.
  it('treats a falsy stored value as present', async () => {
    const storage = withLegacyReads(memoryStorage({ flag: false }), memoryStorage({ flag: true }))
    expect(await storage.get('flag', null)).toBe(false)
  })

  // The recovery walks every key it can see, so a board stranded in the legacy home has
  // to show up in this list or it stays invisible.
  it('lists the keys of both homes, without duplicates', async () => {
    const storage = withLegacyReads(memoryStorage({ recent: 1, shared: 1 }), memoryStorage({ old: 1, shared: 1 }))
    expect((await storage.keys()).sort()).toEqual(['old', 'recent', 'shared'])
  })

  it('writes only to the new home', async () => {
    const primary = memoryStorage()
    const legacy = memoryStorage()
    await withLegacyReads(primary, legacy).set('board', 'written')

    expect(primary.entries.get('board')).toBe('written')
    expect(legacy.entries.has('board')).toBe(false)
  })

  // The legacy home is a source, never a destination: deleting there would throw away
  // the only copy of a board this mod hasn't rewritten yet.
  it('deletes only from the new home', async () => {
    const primary = memoryStorage({ board: 'new' })
    const legacy = memoryStorage({ board: 'old' })
    await withLegacyReads(primary, legacy).delete('board')

    expect(primary.entries.has('board')).toBe(false)
    expect(legacy.entries.get('board')).toBe('old')
  })
})
