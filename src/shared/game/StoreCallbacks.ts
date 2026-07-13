// The internal store handle the mod reads (window.__subwayBuilder_storeCallbacks__)
// for the loaded save's id — used to scope markers per save. The public API doesn't
// expose it, so this is the one internal read the mod needs. Treated as optional: a
// missing handle degrades gracefully (no save id → the city cache still keeps games
// apart via the onGameInit reset).
export interface GameStateSnapshot {
  cityCode?: string
  currentSaveInfo?: null | { id?: string, name?: string }
}

export interface StoreCallbacks {
  getState(): GameStateSnapshot
}
