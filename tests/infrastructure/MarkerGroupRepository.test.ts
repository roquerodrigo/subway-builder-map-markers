import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { ModStorage } from '@/infrastructure/persistence/ModStorage'

import { MarkerRepository } from '@/infrastructure/persistence/MarkerRepository'

interface MemoryStorage extends ModStorage {
  entries: Map<string, unknown>
}

function createMemoryStorage(): MemoryStorage {
  const entries = new Map<string, unknown>()

  return {
    delete: (key) => {
      entries.delete(key)

      return Promise.resolve()
    },
    entries,
    get: <T>(key: string, fallback: T): Promise<T> =>
      Promise.resolve(entries.has(key) ? (entries.get(key) as T) : fallback),
    keys: () => Promise.resolve([...entries.keys()]),
    set: (key, value) => {
      entries.set(key, value)

      return Promise.resolve()
    },
  }
}

function group(overrides: Partial<MarkerGroup> = {}): MarkerGroup {
  return { color: '#0a4d9c', hidden: false, id: 'g1', markerIds: [], name: 'Line 1', ...overrides }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MarkerRepository folders', () => {
  it('round-trips the folders of a save', async () => {
    const repository = new MarkerRepository(createMemoryStorage())
    await repository.saveGroupsForSave('save-a', [group()], null)
    expect(await repository.loadGroupsForSave('save-a')).toEqual([group()])
  })

  it('round-trips the recent folders of a city', async () => {
    const repository = new MarkerRepository(createMemoryStorage())
    await repository.saveGroupsRecent('sao-paulo', [group()])
    expect(await repository.loadGroupsRecent('sao-paulo')).toEqual([group()])
  })

  it('keeps folders in keys separate from the markers of the same bucket', async () => {
    const storage = createMemoryStorage()
    const repository = new MarkerRepository(storage)
    await repository.saveForSave('save-a', [], null)
    await repository.saveGroupsForSave('save-a', [group()], null)
    expect([...storage.entries.keys()]).toEqual(['save:save-a', 'groups:save:save-a'])
  })

  it('stores a schema version alongside the folders', async () => {
    const storage = createMemoryStorage()
    const repository = new MarkerRepository(storage)
    await repository.saveGroupsForSave('save-a', [group()], null)
    expect(storage.entries.get('groups:save:save-a')).toEqual({ groups: [group()], savedAt: expect.any(Number), version: 1 })
  })

  it('reads no folders for a bucket that was never written', async () => {
    const repository = new MarkerRepository(createMemoryStorage())
    expect(await repository.loadGroupsForSave('unknown')).toEqual([])
  })

  it('does not warn about a folder bucket that is simply empty', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repository = new MarkerRepository(createMemoryStorage())
    await repository.loadGroupsForSave('unknown')
    expect(warn).not.toHaveBeenCalled()
  })

  it('discards folders written by an unknown schema version', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = createMemoryStorage()
    storage.entries.set('groups:save:save-a', { groups: [group()], version: 99 })
    const repository = new MarkerRepository(storage)
    expect(await repository.loadGroupsForSave('save-a')).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('discards a payload whose folders are not a list', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = createMemoryStorage()
    storage.entries.set('groups:recent:sao-paulo', { groups: 'not a list', version: 1 })
    const repository = new MarkerRepository(storage)
    expect(await repository.loadGroupsRecent('sao-paulo')).toEqual([])
  })

  it('drops folders with no usable id, so their markers are not orphaned to a new id', async () => {
    const storage = createMemoryStorage()
    storage.entries.set('groups:save:save-a', {
      groups: [null, 'a string', { name: 'no id' }, { id: '', name: 'blank id' }, group()],
      version: 1,
    })
    const repository = new MarkerRepository(storage)
    expect(await repository.loadGroupsForSave('save-a')).toEqual([group()])
  })

  it('heals a folder whose fields are missing or mistyped', async () => {
    const storage = createMemoryStorage()
    storage.entries.set('groups:save:save-a', {
      groups: [{ color: 7, hidden: 'yes', id: 'g1', name: null }],
      version: 1,
    })
    const repository = new MarkerRepository(storage)
    expect(await repository.loadGroupsForSave('save-a')).toEqual([
      { color: null, hidden: false, id: 'g1', markerIds: [], name: '' },
    ])
  })

  it('keeps a save bucket and the city cache apart', async () => {
    const repository = new MarkerRepository(createMemoryStorage())
    await repository.saveGroupsForSave('save-a', [group({ name: 'own' })], null)
    await repository.saveGroupsRecent('sao-paulo', [group({ name: 'cached' })])
    expect((await repository.loadGroupsForSave('save-a'))[0].name).toBe('own')
    expect((await repository.loadGroupsRecent('sao-paulo'))[0].name).toBe('cached')
  })
})
