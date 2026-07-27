import { createGameFileStorage } from '@/infrastructure/persistence/GameFileStorage'
import { withLegacyReads } from '@/infrastructure/persistence/LegacyBackedStorage'
import { createLocalStorage } from '@/infrastructure/persistence/LocalStorageStorage'

// One async key/value interface over persistence, so the repository doesn't care
// where data lives.
export interface ModStorage {
  delete(key: string): Promise<void>
  get<T>(key: string, fallback: T): Promise<T>
  keys(): Promise<string[]>
  set(key: string, value: unknown): Promise<void>
}

// The board is written to the game's own per-mod storage — a JSON file in the app data
// dir, out of reach of whatever cleared the mod's localStorage keys — and read from
// there first, falling back to localStorage for boards drawn before the move. Without
// the IPC bridge (a build that doesn't expose it), localStorage is all there is.
export function createModStorage(): ModStorage {
  const legacy = createLocalStorage()
  const gameFile = createGameFileStorage()

  return gameFile ? withLegacyReads(gameFile, legacy) : legacy
}
