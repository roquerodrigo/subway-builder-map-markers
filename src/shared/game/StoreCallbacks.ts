import type { Coordinate } from '@/shared/game/Coordinate'

// The internal store handle the mod reads (window.__subwayBuilder_storeCallbacks__).
// Primarily for the loaded save's id (to scope markers per save); optionally the
// stations list and the setStations action, used by the opt-in "name a station from its
// marker" feature. The public API exposes none of this, so this is the mod's one
// internal read. Treated as optional throughout: a missing handle or member degrades
// gracefully (no save id → the city cache still keeps games apart; no station access →
// station naming simply does nothing).
//
// A custom name is written by committing the whole stations array with the target's
// `name` changed (setStations) — the game's `updateStationName` action re-derives the
// name from nearby streets and ignores an arbitrary string, so it can't be used here.
export interface GameStateSnapshot {
  cityCode?: string
  currentSaveInfo?: null | { id?: string, name?: string }
  setStations?(stations: GameStation[]): void
  stations?: GameStation[]
}

// A game station, only the fields the mod reads: its id, current name, [lng, lat]
// coords (same order as a marker position) and buildType — "blueprint" while it's a
// planned placement, "constructed" once built. The mod carries every other field
// through untouched when it rewrites the array.
export interface GameStation {
  buildType?: string
  coords: Coordinate
  id: string
  name: string
}

export interface StoreCallbacks {
  getState(): GameStateSnapshot
}
