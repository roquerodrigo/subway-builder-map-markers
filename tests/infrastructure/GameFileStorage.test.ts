import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGameFileStorage } from '@/infrastructure/persistence/GameFileStorage'

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>

// Stands in for the game's main process: it answers on the same channels, with the same
// envelope, and keeps the file it would have written.
function installBridge(overrides: Partial<Record<string, Invoke>> = {}): { file: Map<string, unknown>, invoke: Invoke } {
  const file = new Map<string, unknown>()
  const invoke = vi.fn<Invoke>(async (channel, modId, key, value) => {
    expect(modId).toBe('map-markers')
    const override = overrides[channel]
    if (override) {
      return override(channel, modId, key, value)
    }
    switch (channel) {
      case 'mod-storage-delete':
        file.delete(key as string)

        return { success: true }
      case 'mod-storage-get':
        return file.has(key as string) ? { success: true, value: file.get(key as string) } : { success: true }
      case 'mod-storage-keys':
        return { keys: [...file.keys()], success: true }
      case 'mod-storage-set':
        file.set(key as string, value)

        return { success: true }
      default:
        throw new Error(`unexpected channel ${channel}`)
    }
  })
  window.electron = { invoke }

  return { file, invoke }
}

afterEach(() => {
  delete window.electron
  vi.restoreAllMocks()
})

describe('createGameFileStorage', () => {
  it('is unavailable without the IPC bridge, so the caller can fall back', () => {
    delete window.electron
    expect(createGameFileStorage()).toBeNull()
  })

  it('round-trips a value through the game s own storage', async () => {
    const { file } = installBridge()
    const storage = createGameFileStorage()!
    await storage.set('recent:RMSP', { markers: [{ id: 'a' }] })

    expect(file.get('recent:RMSP')).toEqual({ markers: [{ id: 'a' }] })
    expect(await storage.get('recent:RMSP', null)).toEqual({ markers: [{ id: 'a' }] })
  })

  // The channels answer with { success, value }; reading the envelope as the value
  // would hand the repository a payload it can't parse — the bug in the game's own
  // wrapper around these same channels.
  it('unwraps the response envelope', async () => {
    installBridge()
    const storage = createGameFileStorage()!
    await storage.set('key', 'plain')

    expect(await storage.get('key', null)).toBe('plain')
  })

  it('returns the fallback for a key that was never written', async () => {
    installBridge()
    const storage = createGameFileStorage()!
    expect(await storage.get('missing', 'fallback')).toBe('fallback')
  })

  it('round-trips a falsy value rather than reading it as missing', async () => {
    installBridge()
    const storage = createGameFileStorage()!
    await storage.set('flag', false)

    expect(await storage.get('flag', true)).toBe(false)
  })

  it('lists the keys the mod owns', async () => {
    installBridge()
    const storage = createGameFileStorage()!
    await storage.set('save:a', 1)
    await storage.set('save:b', 2)

    expect((await storage.keys()).sort()).toEqual(['save:a', 'save:b'])
  })

  it('deletes a key', async () => {
    const { file } = installBridge()
    const storage = createGameFileStorage()!
    await storage.set('doomed', 'value')
    await storage.delete('doomed')

    expect(file.has('doomed')).toBe(false)
  })

  it('returns the fallback when the bridge rejects', async () => {
    installBridge({ 'mod-storage-get': () => Promise.reject(new Error('ipc down')) })
    const storage = createGameFileStorage()!

    expect(await storage.get('key', 'fallback')).toBe('fallback')
  })

  it('does not throw when a write fails', async () => {
    installBridge({ 'mod-storage-set': () => Promise.reject(new Error('ipc down')) })
    const storage = createGameFileStorage()!

    await expect(storage.set('key', 'value')).resolves.toBeUndefined()
  })

  it('reads no keys when the bridge answers with something unexpected', async () => {
    installBridge({ 'mod-storage-keys': () => Promise.resolve('nonsense') })
    const storage = createGameFileStorage()!

    expect(await storage.keys()).toEqual([])
  })
})
