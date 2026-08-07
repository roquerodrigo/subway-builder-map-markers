import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'
import type { Coordinate } from '@/shared/game/Coordinate'

import { partitionByGroup } from '@/domain/group/GroupPartition'

// One folder's markers as a path to follow: the line the player is sketching, ready to
// be drawn as a guide for laying the track.
export interface MarkerRoute {
  color: string
  groupId: string
  points: Coordinate[]
}

// The route of every folder that has something to connect, in the order the panel
// lists its markers — dragging a card up or down is what reorders the line, so the
// board stays the single place the path is defined.
//
// Markers outside a folder are left alone: they're loose candidates, not a line, and
// stringing them together would draw a path nobody asked for. A folder takes its own
// color when it has one, so a line reads as the line and not as its first marker; the
// first marker's color is the fallback.
export function markerRoutes(markers: Marker[], groups: MarkerGroup[]): MarkerRoute[] {
  return partitionByGroup(markers, groups)
    .sections
    .filter((section) => section.markers.length > 1)
    .map((section) => ({
      color: section.group.color ?? section.markers[0].color,
      groupId: section.group.id,
      points: section.markers.map((marker) => marker.position),
    }))
}
