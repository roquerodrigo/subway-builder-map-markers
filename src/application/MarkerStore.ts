import type { Marker } from '../domain/marker/Marker'
import type { MarkerRepository } from '../infrastructure/persistence/MarkerRepository'
import type { GameSession } from '../infrastructure/store/GameSession'
import type { Coordinate } from '../shared/game/Coordinate'

import { createMarker } from '../domain/marker/MarkerFactory'

type Listener = () => void

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
  private city: null | string = null
  private freshGame = false
  private listeners = new Set<Listener>()
  private loadToken = 0
  private markers: Marker[] = []
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

  // Reset for a brand-new game (onGameInit): start empty; the next sync clears the
  // city's continuity cache so this game can't inherit the previous one's markers.
  startNewGame(): void {
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
    const saveId = this.session.saveId()
    const city = this.session.cityCode()

    if (this.freshGame) {
      this.saveId = saveId
      this.city = city
      this.markers = []
      this.selectedId = null
      this.loadToken++
      this.notify()
      if (!city) {
        // onGameInit can fire before the city is known. Stay a fresh game until it
        // is: consuming the flag here would let the next sync (once the city shows
        // up) inherit the previous game's markers from the cache.
        return
      }
      this.freshGame = false
      await this.repository.clearRecent(city)
      return
    }

    if (saveId === this.saveId && city === this.city && this.loadToken > 0) {
      return
    }
    this.saveId = saveId
    this.city = city
    const token = ++this.loadToken
    const markers = await this.loadMarkers(saveId, city)
    if (token !== this.loadToken) {
      return // superseded by a newer sync
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
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer)
    }
    const { city, markers, saveId } = this
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      if (saveId) {
        void this.repository.saveForSave(saveId, markers)
      }
      if (city) {
        void this.repository.saveRecent(city, markers)
      }
    }, PERSIST_DEBOUNCE_MS)
  }
}
