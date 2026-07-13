import type { Marker } from '../../domain/marker/Marker'
import type { ModStorage } from './ModStorage'

import { markerIcon } from '../../domain/marker/MarkerIconSet'
import { logger } from '../../shared/Logger'

const SCHEMA_VERSION = 1
const SAVE_PREFIX = 'save:'
const RECENT_PREFIX = 'recent:'
// Where the pre-save-scoped version kept its markers (localStorage, keyed by city).
const LEGACY_PREFIX = 'subwaybuilder.map-markers.'

interface StoredPayload {
  markers: Marker[]
  version: number
}

// Persists markers scoped to the current save. Two buckets, both in the mod's own
// storage: `save:<saveId>` holds a specific save's markers, and `recent:<cityCode>`
// caches the most recent markers per city so the same game keeps them across
// sessions (the game reopens the newest autosave — a different file — so its own
// bucket is empty and inherits from here). All reads are defensive: a malformed or
// legacy payload yields an empty set and heals unknown icons rather than throwing.
export class MarkerRepository {
  constructor(private readonly storage: ModStorage) {}

  async clearRecent(cityCode: string): Promise<void> {
    await this.storage.delete(RECENT_PREFIX + cityCode)
  }

  async loadForSave(saveId: string): Promise<Marker[]> {
    return this.read(SAVE_PREFIX + saveId)
  }

  async loadRecent(cityCode: string): Promise<Marker[]> {
    return this.read(RECENT_PREFIX + cityCode)
  }

  async saveForSave(saveId: string, markers: Marker[]): Promise<void> {
    await this.write(SAVE_PREFIX + saveId, markers)
  }

  async saveRecent(cityCode: string, markers: Marker[]): Promise<void> {
    await this.write(RECENT_PREFIX + cityCode, markers)
  }

  // One-time migration: read the markers the old per-city localStorage bucket held
  // and remove it, so a player's existing markers carry into the first save they
  // open after updating and can't leak into other games on the same city.
  takeLegacy(cityCode: string): Marker[] {
    const key = LEGACY_PREFIX + cityCode
    let raw: null | string
    try {
      raw = window.localStorage.getItem(key)
    } catch {
      return []
    }
    if (!raw) {
      return []
    }
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* best-effort cleanup */
    }
    try {
      const payload = JSON.parse(raw) as StoredPayload
      return sanitizeMarkers(payload?.markers)
    } catch {
      return []
    }
  }

  private async read(key: string): Promise<Marker[]> {
    const payload = await this.storage.get<null | StoredPayload>(key, null)
    if (!payload || payload.version !== SCHEMA_VERSION || !Array.isArray(payload.markers)) {
      if (payload) {
        logger.warn('discarding unreadable saved markers for', key)
      }
      return []
    }
    return sanitizeMarkers(payload.markers)
  }

  private async write(key: string, markers: Marker[]): Promise<void> {
    const payload: StoredPayload = { markers, version: SCHEMA_VERSION }
    await this.storage.set(key, payload)
  }
}

function sanitizeMarkers(value: unknown): Marker[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map(sanitize).filter((marker): marker is Marker => marker !== null)
}

// Accept only well-formed markers; heal a missing/unknown icon or field so a
// hand-edited or older payload can't break the map layer.
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
  return {
    id: typeof candidate.id === 'string' ? candidate.id : `m-${Math.random().toString(36).slice(2)}`,
    position: [position[0], position[1]],
    color: typeof candidate.color === 'string' ? candidate.color : '#3b82f6',
    icon: markerIcon(typeof candidate.icon === 'string' ? candidate.icon : '').key,
    label: typeof candidate.label === 'string' ? candidate.label : '',
  }
}
