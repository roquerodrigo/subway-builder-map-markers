// One async key/value interface over persistence, so the repository doesn't care
// where data lives.
export interface ModStorage {
  delete(key: string): Promise<void>
  get<T>(key: string, fallback: T): Promise<T>
  set(key: string, value: unknown): Promise<void>
}

const PREFIX = 'subwaybuilder.map-markers.kv.'

// Backed by localStorage. The game's official per-mod storage (api.storage) was
// evaluated but is a no-op in this build — a set() followed by get() returns the
// fallback and keys() stays empty — so it can't be relied on to persist. localStorage
// does persist across sessions in the Electron renderer; it's namespaced by the
// prefix above. Kept behind an async interface so switching back to api.storage, if
// it starts working, is a one-file change.
export function createModStorage(): ModStorage {
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
