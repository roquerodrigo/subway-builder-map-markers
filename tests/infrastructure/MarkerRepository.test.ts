import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Marker } from '@/domain/marker/Marker'
import type { ModStorage } from '@/infrastructure/persistence/ModStorage'

import { DEFAULT_MARKER_ICON } from '@/domain/marker/MarkerIconSet'
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
    set: (key, value) => {
      entries.set(key, value)

      return Promise.resolve()
    },
  }
}

function marker(overrides: Partial<Marker> = {}): Marker {
  return {
    color: '#ef4444',
    icon: DEFAULT_MARKER_ICON,
    id: 'marker-1',
    label: 'North',
    position: [-46.6, -23.5],
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MarkerRepository', () => {
  it('round-trips the markers of a save', async () => {
    const repository = new MarkerRepository(createMemoryStorage())
    await repository.saveForSave('save-a', [marker()])
    expect(await repository.loadForSave('save-a')).toEqual([marker()])
  })

  it('round-trips the recent markers of a city', async () => {
    const repository = new MarkerRepository(createMemoryStorage())
    await repository.saveRecent('sao-paulo', [marker()])
    expect(await repository.loadRecent('sao-paulo')).toEqual([marker()])
  })

  it('keeps the save bucket and the city cache in separate keys', async () => {
    const storage = createMemoryStorage()
    const repository = new MarkerRepository(storage)
    await repository.saveForSave('sao-paulo', [marker({ label: 'from the save' })])
    await repository.saveRecent('sao-paulo', [marker({ label: 'from the cache' })])
    expect([...storage.entries.keys()]).toEqual(['save:sao-paulo', 'recent:sao-paulo'])
  })

  it('stores a schema version alongside the markers', async () => {
    const storage = createMemoryStorage()
    const repository = new MarkerRepository(storage)
    await repository.saveForSave('save-a', [marker()])
    expect(storage.entries.get('save:save-a')).toEqual({ markers: [marker()], version: 1 })
  })

  it('reads nothing for a save that was never written', async () => {
    const repository = new MarkerRepository(createMemoryStorage())
    expect(await repository.loadForSave('unknown')).toEqual([])
  })

  it('reads nothing for a city that was never written', async () => {
    const repository = new MarkerRepository(createMemoryStorage())
    expect(await repository.loadRecent('unknown')).toEqual([])
  })

  it('clears the city cache without touching the save bucket', async () => {
    const repository = new MarkerRepository(createMemoryStorage())
    await repository.saveForSave('save-a', [marker()])
    await repository.saveRecent('sao-paulo', [marker()])
    await repository.clearRecent('sao-paulo')
    expect(await repository.loadRecent('sao-paulo')).toEqual([])
    expect(await repository.loadForSave('save-a')).toEqual([marker()])
  })

  it('does not warn about a bucket that is simply empty', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repository = new MarkerRepository(createMemoryStorage())
    await repository.loadForSave('unknown')
    expect(warn).not.toHaveBeenCalled()
  })

  it('discards a payload written by an unknown schema version', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = createMemoryStorage()
    storage.entries.set('save:save-a', { markers: [marker()], version: 99 })
    const repository = new MarkerRepository(storage)
    expect(await repository.loadForSave('save-a')).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('discards a payload whose markers are not a list', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = createMemoryStorage()
    storage.entries.set('recent:sao-paulo', { markers: 'not a list', version: 1 })
    const repository = new MarkerRepository(storage)
    expect(await repository.loadRecent('sao-paulo')).toEqual([])
  })

  it('drops the entries of a payload that are not marker-shaped', async () => {
    const storage = createMemoryStorage()
    storage.entries.set('save:save-a', {
      markers: [
        null,
        'a string',
        42,
        { label: 'no position' },
        { position: [1] },
        { position: [1, 2, 3] },
        { position: ['1', 2] },
        { position: [1, '2'] },
        marker(),
      ],
      version: 1,
    })
    const repository = new MarkerRepository(storage)
    expect(await repository.loadForSave('save-a')).toEqual([marker()])
  })

  it('heals a marker whose icon is unknown', async () => {
    const storage = createMemoryStorage()
    storage.entries.set('save:save-a', {
      markers: [{ ...marker(), icon: 'no-such-icon' }],
      version: 1,
    })
    const repository = new MarkerRepository(storage)
    const [healed] = await repository.loadForSave('save-a')
    expect(healed.icon).toBe(DEFAULT_MARKER_ICON)
  })

  it('heals a marker whose optional fields are missing or mistyped', async () => {
    const storage = createMemoryStorage()
    storage.entries.set('save:save-a', {
      markers: [{ color: 7, label: null, position: [-46.6, -23.5] }],
      version: 1,
    })
    const repository = new MarkerRepository(storage)
    const [healed] = await repository.loadForSave('save-a')
    expect(healed).toEqual({
      color: '#3b82f6',
      icon: DEFAULT_MARKER_ICON,
      id: expect.stringMatching(/^m-/) as string,
      label: '',
      position: [-46.6, -23.5],
    })
  })

  it('keeps the id of a marker that already has one', async () => {
    const storage = createMemoryStorage()
    storage.entries.set('save:save-a', {
      markers: [{ ...marker(), id: 'kept-id' }],
      version: 1,
    })
    const repository = new MarkerRepository(storage)
    const [healed] = await repository.loadForSave('save-a')
    expect(healed.id).toBe('kept-id')
  })

  it('copies the position instead of holding on to the stored array', async () => {
    const storage = createMemoryStorage()
    const stored = { ...marker(), position: [1, 2] }
    storage.entries.set('save:save-a', { markers: [stored], version: 1 })
    const repository = new MarkerRepository(storage)
    const [loaded] = await repository.loadForSave('save-a')
    expect(loaded.position).not.toBe(stored.position)
    expect(loaded.position).toEqual([1, 2])
  })
})
