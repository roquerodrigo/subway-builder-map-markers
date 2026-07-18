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

// Split markers into their folders, keeping folder order and, within each folder,
// marker order. A marker with no group — or one whose groupId matches no folder (a
// dangling reference left after a folder was removed) — falls into `ungrouped`, so the
// board never loses a marker just because its folder went away.
export function partitionByGroup(markers: Marker[], groups: MarkerGroup[]): GroupedMarkers {
  const buckets = new Map<string, Marker[]>(groups.map((group) => [group.id, []]))
  const ungrouped: Marker[] = []
  for (const marker of markers) {
    const bucket = marker.groupId == null ? undefined : buckets.get(marker.groupId)
    if (bucket) {
      bucket.push(marker)
    } else {
      ungrouped.push(marker)
    }
  }

  return {
    sections: groups.map((group) => ({ group, markers: buckets.get(group.id) ?? [] })),
    ungrouped,
  }
}
