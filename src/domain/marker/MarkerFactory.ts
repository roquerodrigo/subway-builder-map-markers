import type { Marker } from '@/domain/marker/Marker'
import type { Coordinate } from '@/shared/game/Coordinate'

import { DEFAULT_MARKER_ICON } from '@/domain/marker/MarkerIconSet'
import { DEFAULT_MARKER_COLOR } from '@/domain/marker/MarkerPalette'
import { newId } from '@/shared/id'

// A fresh marker at `position`, with the given 1-based order used only to seed a
// human label ("Marker 3"); everything else takes the defaults the panel can edit.
// A new marker starts outside any folder.
export function createMarker(position: Coordinate, order: number): Marker {
  return {
    color: DEFAULT_MARKER_COLOR,
    icon: DEFAULT_MARKER_ICON,
    id: newId(),
    label: `Marker ${order}`,
    // Copied, so a caller reusing its coordinate array can't move the marker later.
    position: [position[0], position[1]],
  }
}
