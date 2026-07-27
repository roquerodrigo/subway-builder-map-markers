import type { ModStorage } from '@/infrastructure/persistence/ModStorage'

// Reads fall through to where the mod used to write. Boards drawn before the move to
// the game's own storage live in localStorage, so a key missing from the new home is
// looked up in the old one — including in `keys()`, which is what lets a stranded board
// still be found there. Writes only ever go to the new home: the old one is a source,
// not a destination, and nothing is deleted from it.
//
// A board read from the legacy side moves across on its own, because loading one is
// followed by a persist into the current save's buckets.
export function withLegacyReads(primary: ModStorage, legacy: ModStorage): ModStorage {
  const MISSING = Symbol('missing')

  return {
    delete: (key) => primary.delete(key),
    get: async <T>(key: string, fallback: T): Promise<T> => {
      const found = await primary.get<symbol | T>(key, MISSING)

      return found === MISSING ? legacy.get(key, fallback) : (found as T)
    },
    keys: async () => [...new Set([...await primary.keys(), ...await legacy.keys()])],
    set: (key, value) => primary.set(key, value),
  }
}
