import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'

export interface GroupedMarkers {
  sections: GroupSection[]
  ungrouped: Marker[]
}

export interface GroupSection {
  group: MarkerGroup
  markers: Marker[]
}

// The folders holding a marker, in board order. What the card shows: every line that
// stops there.
export function groupsHolding(markerId: string, groups: MarkerGroup[]): MarkerGroup[] {
  return groups.filter((group) => group.markerIds.includes(markerId))
}

// Resolve each folder's marker ids into markers, keeping folder order and, within each
// folder, the order the folder itself holds — that sequence is the line, so it belongs
// to the folder rather than to the board.
//
// A marker can appear in several folders (an interchange is on every line that stops
// there), so `ungrouped` is only the markers no folder claims, and an id claimed by a
// folder that matches no marker is skipped: a removed marker can't leave a hole in
// someone's line.
export function partitionByGroup(markers: Marker[], groups: MarkerGroup[]): GroupedMarkers {
  const byId = new Map(markers.map((marker) => [marker.id, marker]))
  const claimed = new Set<string>()
  const sections = groups.map((group) => {
    const held: Marker[] = []
    for (const id of group.markerIds) {
      const marker = byId.get(id)
      if (marker) {
        held.push(marker)
        claimed.add(id)
      }
    }

    return { group, markers: held }
  })

  return { sections, ungrouped: markers.filter((marker) => !claimed.has(marker.id)) }
}
