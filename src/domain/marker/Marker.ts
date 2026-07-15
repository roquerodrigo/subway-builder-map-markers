import type { Coordinate } from '@/shared/game/Coordinate'

// A single map marker: a candidate location the player is sketching (a possible
// station, an interchange, a point of interest…). Pure data — no map or DOM here.
// Display concerns (the influence radius, whether names/circles show) are global
// settings, not per-marker; see domain/settings/MarkerSettings.
export interface Marker {
  color: string
  icon: string
  id: string
  label: string
  position: Coordinate
}

// The optimal center-to-center spacing between neighboring markers is √3 times the
// influence radius: at that distance the influence areas tile with no gap and three
// of them meet at a single point (the thinnest hexagonal covering). Used both to
// draw the spacing guide and to snap placement onto it.
export const OPTIMAL_SPACING_FACTOR = Math.sqrt(3)
