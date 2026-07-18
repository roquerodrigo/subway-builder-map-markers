import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'
import type { MarkerRepository } from '@/infrastructure/persistence/MarkerRepository'
import type { GameSession } from '@/infrastructure/store/GameSession'
import type { Coordinate } from '@/shared/game/Coordinate'

import { createGroup } from '@/domain/group/MarkerGroupFactory'
import { createMarker } from '@/domain/marker/MarkerFactory'

type Listener = () => void

// A write waiting out the debounce, held so sync() can flush it before reloading.
interface PendingWrite {
  city: null | string
  groups: MarkerGroup[]
  markers: Marker[]
  saveId: null | string
}

const PERSIST_DEBOUNCE_MS = 250

// The single source of truth for markers and their folders, shared by the React panel
// and the imperative map layers. Both subscribe here; every mutation notifies listeners
// and (debounced) persists.
//
// Markers and groups are scoped to the current save: keyed by the loaded save's id and
// mirrored to a per-city "recent" cache. The game reopens the newest autosave (a
// different file each time), so a save's own bucket is often empty on load and inherits
// from the city cache — that's how the same game keeps its board across sessions. A
// brand-new game (onGameInit → startNewGame) starts empty and clears that cache, so it
// can't inherit the previous game's board.
//
// Folders let the player organize markers (e.g. one folder per line) and hide a whole
// folder at once: a hidden folder's markers stay in the panel but drop off the map (see
// visibleMarkers, which the controller draws).
export class MarkerStore {
  private cacheClearPending = false
  private city: null | string = null
  private freshGame = false
  private groupList: MarkerGroup[] = []
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

  // Create a folder and select nothing new; the caller keeps the returned group to,
  // e.g., expand it in the panel.
  addGroup(name: string, color: null | string = null): MarkerGroup {
    const group = createGroup(name, color)
    this.groupList = [...this.groupList, group]
    this.commit()

    return group
  }

  all(): Marker[] {
    return this.markers
  }

  // Move a marker into a folder (or out of every folder with null). A groupId that
  // matches no folder is rejected, so a stale id can't orphan a marker.
  assignToGroup(markerId: string, groupId: null | string): void {
    if (groupId !== null && !this.groupList.some((group) => group.id === groupId)) {
      return
    }
    this.update(markerId, { groupId })
  }

  clear(): void {
    if (this.markers.length === 0) {
      return
    }
    this.markers = []
    this.selectedId = null
    this.commit()
  }

  groups(): MarkerGroup[] {
    return this.groupList
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

  // Drop a folder without deleting its markers: they fall back to "no folder" so
  // nothing on the board is lost.
  removeGroup(id: string): void {
    if (!this.groupList.some((group) => group.id === id)) {
      return
    }
    this.groupList = this.groupList.filter((group) => group.id !== id)
    this.markers = this.markers.map((marker) => (marker.groupId === id ? { ...marker, groupId: null } : marker))
    this.commit()
  }

  renameGroup(id: string, name: string): void {
    let changed = false
    this.groupList = this.groupList.map((group) => {
      if (group.id !== id || group.name === name) {
        return group
      }
      changed = true

      return { ...group, name }
    })
    if (changed) {
      this.commit()
    }
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

  setGroupHidden(id: string, hidden: boolean): void {
    let changed = false
    this.groupList = this.groupList.map((group) => {
      if (group.id !== id || group.hidden === hidden) {
        return group
      }
      changed = true

      return { ...group, hidden }
    })
    if (changed) {
      this.commit()
    }
  }

  // Reset for a brand-new game (onGameInit): start empty, and have the next sync
  // clear the city's continuity cache so this game can't inherit the previous one's
  // board.
  startNewGame(): void {
    this.cacheClearPending = true
    this.freshGame = true
    this.groupList = []
    this.markers = []
    this.selectedId = null
    this.saveId = null
    this.notify()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  // Load the current save's markers and folders. Called on start and on the save/city
  // lifecycle hooks. Safe to call repeatedly: a no-op when nothing changed.
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

    // A brand-new game must not inherit the city's cached board, but onGameInit can
    // fire before the city is known — so the clear waits for a city rather than being
    // skipped. It runs before the load below, which is what stops the new game from
    // reading the cache it is about to drop.
    if (this.cacheClearPending && city) {
      this.cacheClearPending = false
      await this.repository.clearRecent(city)
    }

    if (this.freshGame) {
      // startNewGame already emptied the store; adopt the ids and skip the load so a
      // new game opens on a clean map. The flag is consumed even when the city is
      // still unknown: leaving it set would re-empty the board on every later sync —
      // and a sync runs on every autosave.
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
    const loaded = await this.loadData(saveId, city)
    if (token !== this.loadToken) {
      return // superseded by a newer sync
    }

    // The player drew on a game that had no save id yet, and the save now naming it
    // holds nothing of its own: this board is the save's first. Keep it — loading the
    // empty bucket over the top would drop what they just drew. Only when there's
    // nothing to lose: a save with markers of its own still wins.
    if (wasUnsaved && loaded.markers.length === 0 && this.markers.length > 0) {
      this.persist()

      return
    }

    this.markers = loaded.markers
    this.groupList = loaded.groups
    this.selectedId = null
    this.notify()
    if (loaded.markers.length > 0 || loaded.groups.length > 0) {
      this.persist() // seed this save's buckets + the city cache
    }
  }

  toggleGroupHidden(id: string): void {
    const group = this.groupList.find((candidate) => candidate.id === id)
    if (group) {
      this.setGroupHidden(id, !group.hidden)
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

  // The markers the map should draw: everything except markers inside a hidden folder.
  // A marker with no folder (or a dangling groupId) is always visible.
  visibleMarkers(): Marker[] {
    const hidden = new Set(this.groupList.filter((group) => group.hidden).map((group) => group.id))
    if (hidden.size === 0) {
      return this.markers
    }

    return this.markers.filter((marker) => marker.groupId == null || !hidden.has(marker.groupId))
  }

  private commit(): void {
    this.notify()
    this.persist()
  }

  // Write whatever is waiting out the debounce, now. Keyed to the save/city the edit
  // was made under, not the current one, so flushing during a save swap still files
  // the board where it belongs.
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
      await this.repository.saveGroupsForSave(pending.saveId, pending.groups)
    }
    if (pending.city) {
      await this.repository.saveRecent(pending.city, pending.markers)
      await this.repository.saveGroupsRecent(pending.city, pending.groups)
    }
  }

  // Save's own bucket, empty on load → inherit the city's recent board → empty. Markers
  // gate the choice; the folders of the same bucket come along with them.
  private async loadData(saveId: null | string, city: null | string): Promise<{ groups: MarkerGroup[], markers: Marker[] }> {
    if (saveId) {
      const own = await this.repository.loadForSave(saveId)
      if (own.length > 0) {
        return { groups: await this.repository.loadGroupsForSave(saveId), markers: own }
      }
    }
    if (city) {
      return {
        groups: await this.repository.loadGroupsRecent(city),
        markers: await this.repository.loadRecent(city),
      }
    }

    return { groups: [], markers: [] }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  // Coalesce the many writes a drag produces into one write to each bucket.
  private persist(): void {
    this.pendingWrite = { city: this.city, groups: this.groupList, markers: this.markers, saveId: this.saveId }
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer)
    }
    this.persistTimer = setTimeout(() => void this.flushPersist(), PERSIST_DEBOUNCE_MS)
  }
}
