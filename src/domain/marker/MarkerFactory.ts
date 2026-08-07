import type { Marker } from '@/domain/marker/Marker'
import type { Coordinate } from '@/shared/game/Coordinate'

import { DEFAULT_MARKER_ICON } from '@/domain/marker/MarkerIconSet'
import { DEFAULT_MARKER_COLOR } from '@/domain/marker/MarkerPalette'
import { newId } from '@/shared/id'

export type MarkerSeed = Partial<Pick<Marker, 'color' | 'icon' | 'label'>>

// A fresh marker at `position`, with the given 1-based order used only to seed a
// human label ("Marker 3") when the caller has no better one. A new marker starts
// outside any folder; `seed` carries what the placement already knows — the name the
// roads there give it, and the colour of the folder it is joining.
export function createMarker(position: Coordinate, order: number, seed: MarkerSeed = {}): Marker {
  return {
    color: seed.color ?? DEFAULT_MARKER_COLOR,
    icon: seed.icon ?? DEFAULT_MARKER_ICON,
    id: newId(),
    label: seed.label ?? `Marker ${order}`,
    // Copied, so a caller reusing its coordinate array can't move the marker later.
    position: [position[0], position[1]],
  }
}
