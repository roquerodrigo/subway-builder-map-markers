import type { ModStorage } from '@/infrastructure/persistence/ModStorage'

const PREFIX = 'subwaybuilder.map-markers.kv.'

// Where the mod used to keep everything. It still backs reads, because boards drawn
// before the move to the game's own storage live here — and because it is the only home
// available if the game ever hands the renderer no IPC bridge.
export function createLocalStorage(): ModStorage {
  return {
    delete: (key) => {
      try {
        window.localStorage.removeItem(PREFIX + key)
      } catch {
        /* storage unavailable */
      }

      return Promise.resolve()
    },
    get: <T>(key: string, fallback: T): Promise<T> => {
      try {
        const raw = window.localStorage.getItem(PREFIX + key)

        return Promise.resolve(raw === null ? fallback : (JSON.parse(raw) as T))
      } catch {
        return Promise.resolve(fallback)
      }
    },
    // Every key the mod owns, prefix stripped. Reading them all is how a lost board is
    // found again when the key that should have held it is gone.
    keys: () => {
      try {
        const found = Object.keys(window.localStorage)
          .filter((key) => key.startsWith(PREFIX))
          .map((key) => key.slice(PREFIX.length))

        return Promise.resolve(found)
      } catch {
        return Promise.resolve([])
      }
    },
    set: (key, value) => {
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
      } catch {
        /* storage unavailable */
      }

      return Promise.resolve()
    },
  }
}
