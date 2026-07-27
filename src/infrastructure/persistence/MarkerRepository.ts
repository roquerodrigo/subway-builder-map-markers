import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'
import type { ModStorage } from '@/infrastructure/persistence/ModStorage'

import { markerIcon } from '@/domain/marker/MarkerIconSet'
import { logger } from '@/shared/Logger'

const SCHEMA_VERSION = 1
const SAVE_PREFIX = 'save:'
const RECENT_PREFIX = 'recent:'
// Folders live in their own keys, next to the markers of the same bucket. Keeping them
// out of the marker payload means an existing marker bucket loads unchanged (no schema
// migration, so no risk of dropping markers over a version bump), and a save from
// before folders existed simply reads back an empty folder list.
const GROUPS_SAVE_PREFIX = 'groups:save:'
const GROUPS_RECENT_PREFIX = 'groups:recent:'

interface Candidate {
  key: string
  markers: Marker[]
  savedAt: number
}

interface StoredGroupPayload {
  city?: string
  groups: MarkerGroup[]
  savedAt?: number
  version: number
}

// `city` and `savedAt` are what let a board be found again when the key that should
// have held it is gone: every bucket says which city it belongs to and when it was
// written, so the newest one for the current city can be recovered from any key. They
// are optional so a bucket written before they existed still reads back (the schema
// version deliberately stays at 1 — bumping it would discard every existing board).
interface StoredPayload {
  city?: string
  markers: Marker[]
  savedAt?: number
  version: number
}

// Persists a save's board (markers + folders) scoped to the current save. Four keys,
// all in the mod's own storage: `save:<saveId>` / `groups:save:<saveId>` hold a
// specific save's markers and folders, and `recent:<cityCode>` / `groups:recent:<cityCode>`
// cache the most recent board per city so the same game keeps it across sessions (the
// game reopens the newest autosave — a different file — so its own bucket is empty and
// inherits from here). All reads are defensive: a malformed payload yields an empty set
// and heals unknown icons/fields rather than throwing.
export class MarkerRepository {
  constructor(private readonly storage: ModStorage) {}

  async loadForSave(saveId: string): Promise<Marker[]> {
    return this.read(SAVE_PREFIX + saveId)
  }

  async loadGroupsForSave(saveId: string): Promise<MarkerGroup[]> {
    return this.readGroups(GROUPS_SAVE_PREFIX + saveId)
  }

  async loadGroupsRecent(cityCode: string): Promise<MarkerGroup[]> {
    return this.readGroups(GROUPS_RECENT_PREFIX + cityCode)
  }

  // Last resort: the newest board this city has anywhere in the mod's storage. A save
  // is scoped by its own key and a city by the recent key, but both can end up empty
  // while the board itself is still sitting in the bucket of some other save (the game
  // keeps 2 autosaves per city, so a board outlives the file it was filed under, and a
  // key that goes missing strands it). Reading every bucket finds it again.
  async loadLatestForCity(cityCode: string): Promise<null | { groups: MarkerGroup[], markers: Marker[] }> {
    const keys = await this.storage.keys()
    let match: Candidate | null = null
    let unlabelled: Candidate | null = null
    for (const key of keys) {
      if (!key.startsWith(SAVE_PREFIX) && !key.startsWith(RECENT_PREFIX)) {
        continue
      }
      const payload = await this.storage.get<null | StoredPayload>(key, null)
      if (!payload) {
        continue
      }
      const markers = this.parse(payload, key)
      if (markers.length === 0) {
        continue
      }
      const candidate: Candidate = { key, markers, savedAt: typeof payload.savedAt === 'number' ? payload.savedAt : 0 }
      if (payload.city === cityCode) {
        match = newer(candidate, match)
      } else if (payload.city === undefined) {
        // Written before buckets recorded their city. Usable only when nothing claims
        // this city, since the alternative is drawing an empty map over a saved board.
        unlabelled = newer(candidate, unlabelled)
      }
    }
    const best = match ?? unlabelled
    if (!best) {
      return null
    }
    logger.warn('recovered the board from', best.key)

    return { groups: await this.readGroups('groups:' + best.key), markers: best.markers }
  }

  async loadRecent(cityCode: string): Promise<Marker[]> {
    return this.read(RECENT_PREFIX + cityCode)
  }

  async saveForSave(saveId: string, markers: Marker[], cityCode: null | string): Promise<void> {
    await this.write(SAVE_PREFIX + saveId, markers, cityCode)
  }

  async saveGroupsForSave(saveId: string, groups: MarkerGroup[], cityCode: null | string): Promise<void> {
    await this.writeGroups(GROUPS_SAVE_PREFIX + saveId, groups, cityCode)
  }

  async saveGroupsRecent(cityCode: string, groups: MarkerGroup[]): Promise<void> {
    await this.writeGroups(GROUPS_RECENT_PREFIX + cityCode, groups, cityCode)
  }

  async saveRecent(cityCode: string, markers: Marker[]): Promise<void> {
    await this.write(RECENT_PREFIX + cityCode, markers, cityCode)
  }

  private parse(payload: null | StoredPayload, key: string): Marker[] {
    if (!payload || payload.version !== SCHEMA_VERSION || !Array.isArray(payload.markers)) {
      if (payload) {
        logger.warn('discarding unreadable saved markers for', key)
      }

      return []
    }

    return payload.markers.map(sanitize).filter((marker): marker is Marker => marker !== null)
  }

  private async read(key: string): Promise<Marker[]> {
    return this.parse(await this.storage.get<null | StoredPayload>(key, null), key)
  }

  private async readGroups(key: string): Promise<MarkerGroup[]> {
    const payload = await this.storage.get<null | StoredGroupPayload>(key, null)
    if (!payload || payload.version !== SCHEMA_VERSION || !Array.isArray(payload.groups)) {
      if (payload) {
        logger.warn('discarding unreadable saved folders for', key)
      }

      return []
    }

    return payload.groups.map(sanitizeGroup).filter((group): group is MarkerGroup => group !== null)
  }

  private async write(key: string, markers: Marker[], cityCode: null | string): Promise<void> {
    const payload: StoredPayload = { markers, savedAt: Date.now(), version: SCHEMA_VERSION }
    if (cityCode) {
      payload.city = cityCode
    }
    await this.storage.set(key, payload)
  }

  private async writeGroups(key: string, groups: MarkerGroup[], cityCode: null | string): Promise<void> {
    const payload: StoredGroupPayload = { groups, savedAt: Date.now(), version: SCHEMA_VERSION }
    if (cityCode) {
      payload.city = cityCode
    }
    await this.storage.set(key, payload)
  }
}

// The better of two recovery candidates: the one written last, falling back to the
// fuller board when neither carries a timestamp (buckets predating them read as 0).
function newer(candidate: Candidate, best: Candidate | null): Candidate {
  if (!best) {
    return candidate
  }
  if (candidate.savedAt !== best.savedAt) {
    return candidate.savedAt > best.savedAt ? candidate : best
  }

  return candidate.markers.length > best.markers.length ? candidate : best
}

// Accept only well-formed markers; heal a missing/unknown icon or field so a
// hand-edited payload can't break the map layer. A folder reference is kept only when
// it's a string; anything else (or absent) reads as "no folder".
function sanitize(value: unknown): Marker | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const candidate = value as Partial<Marker>
  const position = candidate.position
  if (
    !Array.isArray(position) ||
    position.length !== 2 ||
    typeof position[0] !== 'number' ||
    typeof position[1] !== 'number'
  ) {
    return null
  }
  const marker: Marker = {
    color: typeof candidate.color === 'string' ? candidate.color : '#3b82f6',
    icon: markerIcon(typeof candidate.icon === 'string' ? candidate.icon : '').key,
    id: typeof candidate.id === 'string' ? candidate.id : `m-${Math.random().toString(36).slice(2)}`,
    label: typeof candidate.label === 'string' ? candidate.label : '',
    position: [position[0], position[1]],
  }
  if (typeof candidate.groupId === 'string') {
    marker.groupId = candidate.groupId
  }

  return marker
}

// Accept only well-formed folders; heal each field so a hand-edited payload can't break
// the panel. A folder with no usable id is dropped rather than given a random one (its
// markers would point at the old id, so a fresh id would just orphan them).
function sanitizeGroup(value: unknown): MarkerGroup | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const candidate = value as Partial<MarkerGroup>
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null
  }

  return {
    collapsed: typeof candidate.collapsed === 'boolean' ? candidate.collapsed : false,
    color: typeof candidate.color === 'string' ? candidate.color : null,
    hidden: typeof candidate.hidden === 'boolean' ? candidate.hidden : false,
    id: candidate.id,
    name: typeof candidate.name === 'string' ? candidate.name : '',
  }
}
