import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'
import type { DropSide } from '@/domain/ordering/ItemOrder'
import type { MarkerRepository } from '@/infrastructure/persistence/MarkerRepository'
import type { GameSession } from '@/infrastructure/store/GameSession'
import type { Coordinate } from '@/shared/game/Coordinate'

import { withLegacyGroupIds, withSequencesFromLegacy } from '@/domain/group/LegacyGroupLink'
import { createGroup } from '@/domain/group/MarkerGroupFactory'
import { createMarker } from '@/domain/marker/MarkerFactory'
import { moveAfter, moveBefore } from '@/domain/ordering/ItemOrder'
import { orderAlongPath } from '@/domain/route/PathOrder'

// A marker dropped by the panel: which list it was dragged out of and which one it was
// dropped into (null being the ungrouped list). Dragging moves; the card's folder chips
// are what put one marker on a second line.
export interface MarkerDrop {
  from: null | string
  markerId: string
  to: null | string
}

// The card a marker was dropped on, and which side of it. Absent when the drop landed
// on a folder itself rather than on one of its cards.
export interface MarkerDropTarget {
  id: string
  side: DropSide
}

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
// brand-new game (onGameInit → startNewGame) starts empty and stops reading that cache
// until a save is loaded, so it can't inherit the previous game's board. Nothing is
// ever deleted to achieve that: the cache is the only thread holding a board between
// sessions, so dropping it strands the markers in save buckets the game will not
// reopen (it keeps 2 autosaves per city). That cost the user their board twice.
//
// And because that cache can still go missing — it was deleted from under the mod a
// third time, by something outside it — a board that neither lookup finds is searched
// for across every bucket of the same city before the map is drawn empty. Stranded is
// not lost: the markers are still filed under the saves they were drawn in.
//
// Folders let the player organize markers (e.g. one folder per line) and hide a whole
// folder at once: a hidden folder's markers stay in the panel but drop off the map (see
// visibleMarkers, which the controller draws).
export class MarkerStore {
  private city: null | string = null
  private freshGame = false
  private groupList: MarkerGroup[] = []
  private inheritsCityCache = true
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

  // Put a marker on a folder's line, at the end of it, without taking it off any other:
  // an interchange is on every line that stops there. A marker or folder that isn't
  // there, or a marker the folder already holds, is a no-op.
  addToGroup(markerId: string, groupId: string): void {
    if (!this.markers.some((marker) => marker.id === markerId)) {
      return
    }
    this.updateGroup(groupId, (group) => (
      group.markerIds.includes(markerId) ? group : { ...group, markerIds: [...group.markerIds, markerId] }
    ))
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

  groups(): MarkerGroup[] {
    return this.groupList
  }

  // Reorder a folder against another one. Folder order is the order of this list, which
  // is also the order the panel draws them in.
  moveGroup(movedId: string, targetId: string, side: DropSide): void {
    const next = side === 'before' ?
        moveBefore(this.groupList, movedId, targetId) :
        moveAfter(this.groupList, movedId, targetId)
    if (next === this.groupList) {
      return
    }
    this.groupList = next
    this.commit()
  }

  // A marker dropped somewhere by the panel. `from` is the list the drag started in
  // (a folder, or null for the ungrouped list) and `to` is where it was dropped, so a
  // drag out of one line and into another moves it, while the card's own folder chips
  // are what put a marker on a second line. `beside` is the card it was dropped on,
  // absent when it was dropped on the folder itself (it joins at the end).
  moveMarker(drop: MarkerDrop, beside?: MarkerDropTarget): void {
    if (!this.markers.some((marker) => marker.id === drop.markerId)) {
      return
    }
    if (drop.to === null && drop.from === null) {
      this.reorderUngrouped(drop.markerId, beside)

      return
    }
    if (drop.to !== null && !this.groupList.some((group) => group.id === drop.to)) {
      return
    }
    const next = this.groupList.map((group) => {
      if (group.id === drop.from && group.id !== drop.to) {
        return { ...group, markerIds: group.markerIds.filter((id) => id !== drop.markerId) }
      }
      if (group.id === drop.to) {
        return { ...group, markerIds: placeIn(group.markerIds, drop.markerId, beside) }
      }

      return group
    })
    if (next.every((group, index) => sameSequence(group, this.groupList[index]))) {
      return
    }
    this.groupList = next
    this.commit()
  }

  remove(id: string): void {
    const next = this.markers.filter((marker) => marker.id !== id)
    if (next.length === this.markers.length) {
      return
    }
    this.markers = next
    // Off every line it was on: a folder holding a marker that no longer exists would
    // just skip it, but leaving the id there means a new marker reusing it would join
    // a line nobody put it on.
    this.groupList = this.groupList.map((group) => (
      group.markerIds.includes(id) ? { ...group, markerIds: group.markerIds.filter((held) => held !== id) } : group
    ))
    if (this.selectedId === id) {
      this.selectedId = null
    }
    this.commit()
  }

  // Take a marker off one folder's line, leaving it on any other line it is on and on
  // the board (it falls back to the ungrouped list when it was its last folder).
  removeFromGroup(markerId: string, groupId: string): void {
    this.updateGroup(groupId, (group) => (
      group.markerIds.includes(markerId) ?
          { ...group, markerIds: group.markerIds.filter((id) => id !== markerId) } :
        group
    ))
  }

  // Drop a folder without deleting its markers: whatever it held falls back to "no
  // folder" (unless another line also stops there), so nothing on the board is lost.
  removeGroup(id: string): void {
    if (!this.groupList.some((group) => group.id === id)) {
      return
    }
    this.groupList = this.groupList.filter((group) => group.id !== id)
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

  // A save was loaded (onGameLoaded), so whatever new game was pending isn't one: this
  // is an existing board and it may read the city cache again. Without this, opening
  // the game to the main menu — which fires onGameInit with no save loaded, the state
  // the game comes back in after a crash — would leave every save loaded afterwards
  // cut off from the cache.
  resumeSavedGame(): void {
    this.freshGame = false
    this.inheritsCityCache = true
  }

  // Select a marker and make sure the panel can actually show it: a folder holding it
  // is expanded, so the card exists to be scrolled to. Used by the map, where clicking
  // a badge should take you to that station in the list. Only the first folder opens —
  // an interchange would otherwise unfold every line it is on.
  reveal(id: string): void {
    const holder = this.groupList.find((group) => group.markerIds.includes(id))
    if (holder?.collapsed) {
      this.setGroupCollapsed(holder.id, false)
    }
    this.select(id)
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

  setGroupCollapsed(id: string, collapsed: boolean): void {
    let changed = false
    this.groupList = this.groupList.map((group) => {
      if (group.id !== id || group.collapsed === collapsed) {
        return group
      }
      changed = true

      return { ...group, collapsed }
    })
    if (changed) {
      this.commit()
    }
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

  // Reorder one folder's line along the shortest path through its markers, leaving
  // every other folder alone. That order is what the drawn line follows, so this is how
  // a folder filled in some other order (alphabetically, say) becomes a route: one
  // action instead of dragging every card into place.
  sortGroupAlongPath(groupId: string): void {
    const byId = new Map(this.markers.map((marker) => [marker.id, marker]))
    this.updateGroup(groupId, (group) => {
      const held = group.markerIds.map((id) => byId.get(id)).filter((marker) => marker !== undefined)
      const ordered = orderAlongPath(held)
      if (ordered.every((marker, index) => marker === held[index])) {
        return group
      }

      return { ...group, markerIds: ordered.map((marker) => marker.id) }
    })
  }

  // Reset for a brand-new game (onGameInit): start empty, and stop reading the city's
  // continuity cache so this game can't inherit the previous one's board. The cache is
  // left on disk untouched — the game that owns it is still one load away.
  //
  // Ignored while a save is loaded: onGameInit also reaches us when the mod
  // re-bootstraps mid-game (a mod reload), and emptying the board there is destructive,
  // because the next edit persists that empty board over the save's own bucket.
  startNewGame(): void {
    if (this.session.saveId() !== null) {
      return
    }
    this.inheritsCityCache = false
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

  toggleGroupCollapsed(id: string): void {
    const group = this.groupList.find((candidate) => candidate.id === id)
    if (group) {
      this.setGroupCollapsed(id, !group.collapsed)
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

  // The markers the map should draw: everything except the markers every folder holding
  // them has hidden. An interchange stays on the map while any one of its lines is
  // shown, and a marker no folder holds is always visible.
  visibleMarkers(): Marker[] {
    const hidden = new Set<string>()
    const shown = new Set<string>()
    for (const group of this.groupList) {
      for (const markerId of group.markerIds) {
        (group.hidden ? hidden : shown).add(markerId)
      }
    }
    if (hidden.size === 0) {
      return this.markers
    }

    return this.markers.filter((marker) => !hidden.has(marker.id) || shown.has(marker.id))
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
      await this.repository.saveForSave(pending.saveId, pending.markers, pending.city)
      await this.repository.saveGroupsForSave(pending.saveId, pending.groups, pending.city)
    }
    if (pending.city) {
      await this.repository.saveRecent(pending.city, pending.markers)
      await this.repository.saveGroupsRecent(pending.city, pending.groups)
    }
  }

  // Save's own bucket, empty on load → inherit the city's recent board → the newest
  // board this city has in any bucket → empty. Markers gate the choice; the folders of
  // the same bucket come along with them.
  //
  // That third step is what keeps a lost key from reading as a lost board: the game
  // reopens a fresh autosave whose bucket is empty, and if the city cache is gone too
  // — it has been deleted out from under the mod — the board is still there, filed
  // under the saves it was drawn in. Showing an empty map with the board one bucket
  // away is how the player's work went missing.
  private async loadData(saveId: null | string, city: null | string): Promise<{ groups: MarkerGroup[], markers: Marker[] }> {
    if (saveId) {
      const own = await this.repository.loadForSave(saveId)
      if (own.length > 0) {
        return migrated({ groups: await this.repository.loadGroupsForSave(saveId), markers: own })
      }
    }
    if (city && this.inheritsCityCache) {
      const recent = await this.repository.loadRecent(city)
      const groups = await this.repository.loadGroupsRecent(city)
      if (recent.length > 0) {
        return migrated({ groups, markers: recent })
      }
      const recovered = await this.repository.loadLatestForCity(city)

      return migrated(recovered ?? { groups, markers: [] })
    }

    return { groups: [], markers: [] }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  // Coalesce the many writes a drag produces into one write to each bucket. The markers
  // go out carrying the folder that holds them first, so a board written here still
  // opens in a build from before folders held their own sequences.
  private persist(): void {
    this.pendingWrite = {
      city: this.city,
      groups: this.groupList,
      markers: withLegacyGroupIds(this.markers, this.groupList),
      saveId: this.saveId,
    }
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer)
    }
    this.persistTimer = setTimeout(() => void this.flushPersist(), PERSIST_DEBOUNCE_MS)
  }

  // The ungrouped list has no sequence of its own: it is whatever no folder claims, in
  // board order, so reordering there reorders the board.
  private reorderUngrouped(markerId: string, beside?: MarkerDropTarget): void {
    if (!beside) {
      return
    }
    const next = beside.side === 'before' ?
        moveBefore(this.markers, markerId, beside.id) :
        moveAfter(this.markers, markerId, beside.id)
    if (next === this.markers) {
      return
    }
    this.markers = next
    this.commit()
  }

  private updateGroup(id: string, change: (group: MarkerGroup) => MarkerGroup): void {
    let changed = false
    const next = this.groupList.map((group) => {
      if (group.id !== id) {
        return group
      }
      const updated = change(group)
      changed ||= updated !== group

      return updated
    })
    if (changed) {
      this.groupList = next
      this.commit()
    }
  }
}

// A board read off disk, with any folder written before folders held sequences given
// the markers that named it.
function migrated(board: { groups: MarkerGroup[], markers: Marker[] }): { groups: MarkerGroup[], markers: Marker[] } {
  return { groups: withSequencesFromLegacy(board.groups, board.markers), markers: board.markers }
}

// Where a dropped marker lands in a folder's sequence: next to the card it was dropped
// on, or at the end when it was dropped on the folder itself.
function placeIn(markerIds: string[], markerId: string, beside?: MarkerDropTarget): string[] {
  const without = markerIds.filter((id) => id !== markerId)
  if (!beside || beside.id === markerId) {
    return [...without, markerId]
  }
  const target = without.indexOf(beside.id)
  if (target < 0) {
    return [...without, markerId]
  }
  const at = beside.side === 'before' ? target : target + 1

  return [...without.slice(0, at), markerId, ...without.slice(at)]
}

function sameSequence(one: MarkerGroup, other: MarkerGroup): boolean {
  return one.markerIds.length === other.markerIds.length &&
    one.markerIds.every((id, index) => id === other.markerIds[index])
}
