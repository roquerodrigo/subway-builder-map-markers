import type { Marker } from '@/domain/marker/Marker'
import type { MarkerRepository } from '@/infrastructure/persistence/MarkerRepository'
import type { GameSession } from '@/infrastructure/store/GameSession'
import type { Coordinate } from '@/shared/game/Coordinate'

import { createMarker } from '@/domain/marker/MarkerFactory'

type Listener = () => void

// A write waiting out the debounce, held so sync() can flush it before reloading.
interface PendingWrite {
  city: null | string
  markers: Marker[]
  saveId: null | string
}

const PERSIST_DEBOUNCE_MS = 250

// The single source of truth for markers, shared by the React panel and the
// imperative map layers. Both subscribe here; every mutation notifies listeners and
// (debounced) persists.
//
// Markers are scoped to the current save: they're keyed by the loaded save's id and
// also mirrored to a per-city "recent" cache. The game reopens the newest autosave
// (a different file each time), so a save's own bucket is often empty on load and
// inherits from the city cache — that's how the same game keeps its markers across
// sessions. A brand-new game (onGameInit → startNewGame) starts empty and clears
// that cache, so it can't inherit the previous game's markers.
export class MarkerStore {
  private cacheClearPending = false
  private city: null | string = null
  private freshGame = false
  private listeners = new Set<Listener>()
  private loadToken = 0
  private markers: Marker[] = []
  private pendingWrite: null | PendingWrite = null
  private persistTimer: null | ReturnType<typeof setTimeout> = null
  private saveId: null | string = null
  private selectedId: null | string = null

  constructor(
    private readonly repository: MarkerRepository,
    private readonly session: GameSession,
  ) {}

  add(position: Coordinate): Marker {
    const marker = createMarker(position, this.markers.length + 1)
    this.markers = [...this.markers, marker]
    this.selectedId = marker.id
    this.commit()
    return marker
  }

  all(): Marker[] {
    return this.markers
  }

  clear(): void {
    if (this.markers.length === 0) {
      return
    }
    this.markers = []
    this.selectedId = null
    this.commit()
  }

  remove(id: string): void {
    const next = this.markers.filter((marker) => marker.id !== id)
    if (next.length === this.markers.length) {
      return
    }
    this.markers = next
    if (this.selectedId === id) {
      this.selectedId = null
    }
    this.commit()
  }

  select(id: null | string): void {
    if (this.selectedId === id) {
      return
    }
    this.selectedId = id
    this.notify()
  }

  selected(): null | string {
    return this.selectedId
  }

  // Reset for a brand-new game (onGameInit): start empty, and have the next sync
  // clear the city's continuity cache so this game can't inherit the previous one's
  // markers.
  startNewGame(): void {
    this.cacheClearPending = true
    this.freshGame = true
    this.markers = []
    this.selectedId = null
    this.saveId = null
    this.notify()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // Load the current save's markers. Called on start and on the save/city lifecycle
  // hooks. Safe to call repeatedly: a no-op when nothing changed.
  async sync(): Promise<void> {
    // Read the session before anything is awaited: a suspension here would let a
    // slower sync read a newer save than the one it was called for and race the sync
    // that actually owns it.
    const saveId = this.session.saveId()
    const city = this.session.cityCode()

    // An edit still inside the debounce window isn't in the buckets yet, and the
    // load below would replace it with what they hold — the next edit would then
    // persist that stale state over the good bucket, losing it for good.
    await this.flushPersist()

    // A brand-new game must not inherit the city's cached markers, but onGameInit
    // can fire before the city is known — so the clear waits for a city rather than
    // being skipped. It runs before the load below, which is what stops the new game
    // from reading the cache it is about to drop.
    if (this.cacheClearPending && city) {
      this.cacheClearPending = false
      await this.repository.clearRecent(city)
    }

    if (this.freshGame) {
      // startNewGame already emptied the store; adopt the ids and skip the load so a
      // new game opens on a clean map. The flag is consumed even when the city is
      // still unknown: leaving it set would re-empty the markers on every later
      // sync — and a sync runs on every autosave.
      this.freshGame = false
      this.saveId = saveId
      this.city = city
      this.loadToken++
      return
    }

    if (saveId === this.saveId && city === this.city && this.loadToken > 0) {
      return
    }
    const wasUnsaved = this.saveId === null
    this.saveId = saveId
    this.city = city
    const token = ++this.loadToken
    const markers = await this.loadMarkers(saveId, city)
    if (token !== this.loadToken) {
      return // superseded by a newer sync
    }

    // The player drew on a game that had no save id yet, and the save now naming it
    // holds nothing of its own: these markers are this save's first. Keep them —
    // loading the empty bucket over the top would drop what they just drew. Only
    // when there's nothing to lose: a save with markers of its own still wins.
    if (wasUnsaved && markers.length === 0 && this.markers.length > 0) {
      this.persist()
      return
    }

    this.markers = markers
    this.selectedId = null
    this.notify()
    if (markers.length > 0) {
      this.persist() // seed this save's bucket + the city cache
    }
  }

  update(id: string, patch: Partial<Omit<Marker, 'id'>>): void {
    let changed = false
    this.markers = this.markers.map((marker) => {
      if (marker.id !== id) {
        return marker
      }
      changed = true
      return { ...marker, ...patch }
    })
    if (changed) {
      this.commit()
    }
  }

  private commit(): void {
    this.notify()
    this.persist()
  }

  // Write whatever is waiting out the debounce, now. Keyed to the save/city the edit
  // was made under, not the current one, so flushing during a save swap still files
  // the markers where they belong.
  private async flushPersist(): Promise<void> {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    const pending = this.pendingWrite
    this.pendingWrite = null
    if (!pending) {
      return
    }
    if (pending.saveId) {
      await this.repository.saveForSave(pending.saveId, pending.markers)
    }
    if (pending.city) {
      await this.repository.saveRecent(pending.city, pending.markers)
    }
  }

  // Save's own bucket, empty on load → inherit the city's recent markers → empty.
  private async loadMarkers(saveId: null | string, city: null | string): Promise<Marker[]> {
    if (saveId) {
      const own = await this.repository.loadForSave(saveId)
      if (own.length > 0) {
        return own
      }
    }
    if (city) {
      return this.repository.loadRecent(city)
    }
    return []
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  // Coalesce the many writes a drag produces into one write to each bucket.
  private persist(): void {
    this.pendingWrite = { city: this.city, markers: this.markers, saveId: this.saveId }
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer)
    }
    this.persistTimer = setTimeout(() => void this.flushPersist(), PERSIST_DEBOUNCE_MS)
  }
}
