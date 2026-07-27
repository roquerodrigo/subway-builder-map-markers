import type { ModStorage } from '@/infrastructure/persistence/ModStorage'

import { logger } from '@/shared/Logger'

const MOD_ID = 'map-markers'
const GET = 'mod-storage-get'
const SET = 'mod-storage-set'
const DELETE = 'mod-storage-delete'
const KEYS = 'mod-storage-keys'

// Every channel answers with an envelope rather than the value itself.
interface StorageResponse {
  keys?: unknown
  success?: boolean
  value?: unknown
}

// The game's own per-mod storage: a JSON file under the app data dir
// (`mod-data/<modId>.json`) written by the main process. It is the documented place for
// a mod's data and, unlike `localStorage`, nothing in the renderer can clear it — which
// is the whole point here, since the keys holding the board were deleted out of
// localStorage by something outside this mod.
//
// It is reached over the IPC channels directly instead of through the public
// `api.storage` wrapper, which is unusable for this mod: the wrapper resolves the mod
// id from a global the game only sets while mod code is on the stack, so it returns the
// fallback and drops writes whenever the call comes from a timer or a map event — where
// every write this mod makes comes from. (That behaviour is also why `api.storage`
// looked like a no-op when probed from the console.) The wrapper additionally forgets to
// unwrap the envelope above.
export function createGameFileStorage(): ModStorage | null {
  const bridge = window.electron
  if (typeof bridge?.invoke !== 'function') {
    return null
  }

  const call = async (channel: string, ...args: unknown[]): Promise<null | StorageResponse> => {
    try {
      const response = await bridge.invoke(channel, MOD_ID, ...args)

      return typeof response === 'object' && response !== null ? response : null
    } catch (error) {
      // A failed write here means the board didn't reach disk, so it must be visible
      // rather than swallowed the way a storage miss can be.
      logger.warn(`mod storage ${channel} failed:`, error)

      return null
    }
  }

  return {
    delete: async (key) => {
      await call(DELETE, key)
    },
    get: async <T>(key: string, fallback: T): Promise<T> => {
      const response = await call(GET, key)

      return response && response.value !== undefined ? (response.value as T) : fallback
    },
    keys: async () => {
      const response = await call(KEYS)

      return Array.isArray(response?.keys) ? response.keys.filter((key): key is string => typeof key === 'string') : []
    },
    set: async (key, value) => {
      await call(SET, key, value)
    },
  }
}
