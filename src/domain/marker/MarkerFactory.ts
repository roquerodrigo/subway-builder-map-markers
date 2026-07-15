import type { Marker } from '@/domain/marker/Marker'
import type { Coordinate } from '@/shared/game/Coordinate'

import { DEFAULT_MARKER_ICON } from '@/domain/marker/MarkerIconSet'
import { DEFAULT_MARKER_COLOR } from '@/domain/marker/MarkerPalette'

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
    // Copied, so a caller reusing its coordinate array can't move the marker later.
    position: [position[0], position[1]],
    color: DEFAULT_MARKER_COLOR,
    icon: DEFAULT_MARKER_ICON,
    label: `Marker ${order}`,
  }
}
