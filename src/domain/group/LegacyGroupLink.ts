import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'

// The bridge between how folders held their markers before (each marker naming one
// folder, `Marker.groupId`) and how they hold them now (the folder owning an ordered
// list of marker ids, so a marker can be on several lines).
//
// Both directions matter, and neither touches the schema version: bumping it would
// discard every board already on disk.

// Writing: mirror each marker's first folder back onto it, so a board written now still
// opens in a build that only understands one folder per marker. Nothing reads it back
// while the folders carry their own sequences.
export function withLegacyGroupIds(markers: Marker[], groups: MarkerGroup[]): Marker[] {
  const primary = new Map<string, string>()
  for (const group of groups) {
    for (const markerId of group.markerIds) {
      if (!primary.has(markerId)) {
        primary.set(markerId, group.id)
      }
    }
  }

  return markers.map((marker) => {
    const groupId = primary.get(marker.id) ?? null
    if ((marker.groupId ?? null) === groupId) {
      return marker
    }

    return { ...marker, groupId }
  })
}

// Reading: a folder that carries no sequence of its own is a folder written by an
// older build, so its markers are the ones naming it, in board order. Folders that
// already hold a sequence are left exactly as they are — including a folder the player
// has emptied, which must not refill itself from stale marker ids.
export function withSequencesFromLegacy(groups: MarkerGroup[], markers: Marker[]): MarkerGroup[] {
  if (groups.every((group) => group.markerIds.length > 0)) {
    return groups
  }

  return groups.map((group) => {
    if (group.markerIds.length > 0) {
      return group
    }
    const named = markers.filter((marker) => marker.groupId === group.id).map((marker) => marker.id)

    return named.length > 0 ? { ...group, markerIds: named } : group
  })
}
