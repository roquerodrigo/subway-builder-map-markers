import type { Coordinate } from '../../shared/game/Coordinate'
import type { Marker } from './Marker'

import { DEFAULT_MARKER_ICON } from './MarkerIconSet'
import { DEFAULT_MARKER_COLOR } from './MarkerPalette'

function newId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) {
    return uuid
  }
  return `m-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

// A fresh marker at `position`, with the given 1-based order used only to seed a
// human label ("Marker 3"); everything else takes the defaults the panel can edit.
export function createMarker(position: Coordinate, order: number): Marker {
  return {
    id: newId(),
    position,
    color: DEFAULT_MARKER_COLOR,
    icon: DEFAULT_MARKER_ICON,
    label: `Marker ${order}`,
  }
}
