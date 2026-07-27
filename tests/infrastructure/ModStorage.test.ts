import { afterEach, describe, expect, it, vi } from 'vitest'

import { createModStorage } from '@/infrastructure/persistence/ModStorage'

const PREFIX = 'subwaybuilder.map-markers.kv.'

afterEach(() => {
  delete window.electron
  vi.restoreAllMocks()
})

// Without the game's IPC bridge — which is how the tests below run, and how a build
// that doesn't expose it would run — localStorage is the whole storage.
describe('createModStorage with the game s storage available', () => {
  it('writes to the game s own storage instead of localStorage', async () => {
    const file = new Map<string, unknown>()
    window.electron = {
      invoke: (channel: string, _modId: unknown, key: unknown, value: unknown) => {
        if (channel === 'mod-storage-set') {
          file.set(key as string, value)
        }

        return Promise.resolve(file.has(key as string) ? { success: true, value: file.get(key as string) } : { success: true })
      },
    }

    const storage = createModStorage()
    await storage.set('recent:RMSP', { markers: [] })

    expect(file.get('recent:RMSP')).toEqual({ markers: [] })
    expect(window.localStorage.getItem(`${PREFIX}recent:RMSP`)).toBeNull()
  })

  it('still reads a board left behind in localStorage', async () => {
    window.localStorage.setItem(`${PREFIX}recent:RMSP`, '{"markers":[{"id":"a"}]}')
    window.electron = { invoke: () => Promise.resolve({ success: true }) }

    expect(await createModStorage().get('recent:RMSP', null)).toEqual({ markers: [{ id: 'a' }] })
  })
})

describe('createModStorage', () => {
  it('returns the fallback for a key that was never written', async () => {
    const storage = createModStorage()
    expect(await storage.get('missing', 'fallback')).toBe('fallback')
  })

  it('round-trips a structured value', async () => {
    const storage = createModStorage()
    await storage.set('markers', [{ id: 'a', label: 'North' }])
    expect(await storage.get('markers', [])).toEqual([{ id: 'a', label: 'North' }])
  })

  it('round-trips a falsy value rather than reading it as missing', async () => {
    const storage = createModStorage()
    await storage.set('flag', false)
    expect(await storage.get('flag', true)).toBe(false)
  })

  it('namespaces every key under the mod prefix', async () => {
    const storage = createModStorage()
    await storage.set('settings', { radiusMeters: 500 })
    expect(window.localStorage.getItem(`${PREFIX}settings`)).toBe('{"radiusMeters":500}')
  })

  it('deletes a key', async () => {
    const storage = createModStorage()
    await storage.set('doomed', 'value')
    await storage.delete('doomed')
    expect(await storage.get('doomed', null)).toBeNull()
  })

  it('deletes only the key it was asked to delete', async () => {
    const storage = createModStorage()
    await storage.set('keep', 'kept')
    await storage.delete('other')
    expect(await storage.get('keep', null)).toBe('kept')
  })

  it('returns the fallback when the stored value is not readable JSON', async () => {
    window.localStorage.setItem(`${PREFIX}broken`, '{ not json')
    const storage = createModStorage()
    expect(await storage.get('broken', 'fallback')).toBe('fallback')
  })

  it('returns the fallback when reading throws because storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    const storage = createModStorage()
    expect(await storage.get('anything', 'fallback')).toBe('fallback')
  })

  it('swallows a write that throws because storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const storage = createModStorage()
    await expect(storage.set('key', 'value')).resolves.toBeUndefined()
  })

  it('swallows a delete that throws because storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    const storage = createModStorage()
    await expect(storage.delete('key')).resolves.toBeUndefined()
  })
})
