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

interface StoredGroupPayload {
  groups: MarkerGroup[]
  version: number
}

interface StoredPayload {
  markers: Marker[]
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

  async loadRecent(cityCode: string): Promise<Marker[]> {
    return this.read(RECENT_PREFIX + cityCode)
  }

  async saveForSave(saveId: string, markers: Marker[]): Promise<void> {
    await this.write(SAVE_PREFIX + saveId, markers)
  }

  async saveGroupsForSave(saveId: string, groups: MarkerGroup[]): Promise<void> {
    await this.writeGroups(GROUPS_SAVE_PREFIX + saveId, groups)
  }

  async saveGroupsRecent(cityCode: string, groups: MarkerGroup[]): Promise<void> {
    await this.writeGroups(GROUPS_RECENT_PREFIX + cityCode, groups)
  }

  async saveRecent(cityCode: string, markers: Marker[]): Promise<void> {
    await this.write(RECENT_PREFIX + cityCode, markers)
  }

  private async read(key: string): Promise<Marker[]> {
    const payload = await this.storage.get<null | StoredPayload>(key, null)
    if (!payload || payload.version !== SCHEMA_VERSION || !Array.isArray(payload.markers)) {
      if (payload) {
        logger.warn('discarding unreadable saved markers for', key)
      }

      return []
    }

    return payload.markers.map(sanitize).filter((marker): marker is Marker => marker !== null)
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

  private async write(key: string, markers: Marker[]): Promise<void> {
    const payload: StoredPayload = { markers, version: SCHEMA_VERSION }
    await this.storage.set(key, payload)
  }

  private async writeGroups(key: string, groups: MarkerGroup[]): Promise<void> {
    const payload: StoredGroupPayload = { groups, version: SCHEMA_VERSION }
    await this.storage.set(key, payload)
  }
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
