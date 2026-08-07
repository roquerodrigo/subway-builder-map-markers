import { describe, expect, it } from 'vitest'

import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'

import { withLegacyGroupIds, withSequencesFromLegacy } from '@/domain/group/LegacyGroupLink'

function group(id: string, markerIds: string[] = []): MarkerGroup {
  return { color: null, hidden: false, id, markerIds, name: id }
}

function marker(id: string, groupId?: null | string): Marker {
  return { color: '#fff', groupId, icon: 'station', id, label: id, position: [0, 0] }
}

describe('withSequencesFromLegacy', () => {
  it('fills a folder written before folders held sequences, in board order', () => {
    const markers = [marker('3', 'a'), marker('1', 'a'), marker('2', 'b')]
    const migrated = withSequencesFromLegacy([group('a'), group('b')], markers)
    expect(migrated[0].markerIds).toEqual(['3', '1'])
    expect(migrated[1].markerIds).toEqual(['2'])
  })

  // The sequence is the truth now: a folder that carries one has already been reordered
  // by the player, and the markers still name whatever folder they named first.
  it('leaves a folder that already holds a sequence untouched', () => {
    const groups = [group('a', ['1', '2'])]
    const migrated = withSequencesFromLegacy(groups, [marker('3', 'a')])
    expect(migrated).toBe(groups)
    expect(migrated[0].markerIds).toEqual(['1', '2'])
  })

  // Emptying a folder is an edit like any other; refilling it from stale marker ids
  // would undo it on the next load.
  it('leaves an emptied folder empty when no marker names it', () => {
    const migrated = withSequencesFromLegacy([group('a')], [marker('1'), marker('2', 'b')])
    expect(migrated[0].markerIds).toEqual([])
  })

  it('migrates only the folders that need it', () => {
    const groups = [group('a', ['1']), group('b')]
    const migrated = withSequencesFromLegacy(groups, [marker('2', 'b')])
    expect(migrated[0]).toBe(groups[0])
    expect(migrated[1].markerIds).toEqual(['2'])
  })

  it('handles a board with no folders at all', () => {
    expect(withSequencesFromLegacy([], [marker('1')])).toEqual([])
  })
})

describe('withLegacyGroupIds', () => {
  it('mirrors the first folder holding each marker back onto it', () => {
    const groups = [group('a', ['1']), group('b', ['2'])]
    const mirrored = withLegacyGroupIds([marker('1'), marker('2')], groups)
    expect(mirrored.map((held) => held.groupId)).toEqual(['a', 'b'])
  })

  // An older build can only understand one folder per marker, so an interchange takes
  // the first line that stops there.
  it('takes the first folder when a marker is on several lines', () => {
    const groups = [group('a', ['1']), group('b', ['1'])]
    expect(withLegacyGroupIds([marker('1')], groups)[0].groupId).toBe('a')
  })

  it('clears the mirror on a marker no folder holds', () => {
    expect(withLegacyGroupIds([marker('1', 'a')], [group('a')])[0].groupId).toBeNull()
  })

  it('leaves a marker alone when its mirror is already right', () => {
    const markers = [marker('1', 'a')]
    expect(withLegacyGroupIds(markers, [group('a', ['1'])])[0]).toBe(markers[0])
  })

  it('does not touch the markers it was given', () => {
    const markers = [marker('1')]
    withLegacyGroupIds(markers, [group('a', ['1'])])
    expect(markers[0].groupId).toBeUndefined()
  })
})
