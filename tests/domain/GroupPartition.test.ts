import { describe, expect, it } from 'vitest'

import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'

import { partitionByGroup } from '@/domain/group/GroupPartition'

function group(id: string): MarkerGroup {
  return { collapsed: false, color: null, hidden: false, id, name: id }
}

function labelsOf(markers: Marker[]): string[] {
  return markers.map((entry) => entry.id)
}

function marker(id: string, groupId?: null | string): Marker {
  return { color: '#fff', groupId, icon: 'station', id, label: id, position: [0, 0] }
}

describe('partitionByGroup', () => {
  it('groups markers under their folder, keeping marker order', () => {
    const groups = [group('a'), group('b')]
    const markers = [marker('1', 'a'), marker('2', 'b'), marker('3', 'a')]
    const { sections } = partitionByGroup(markers, groups)
    expect(sections.map((section) => section.group.id)).toEqual(['a', 'b'])
    expect(labelsOf(sections[0].markers)).toEqual(['1', '3'])
    expect(labelsOf(sections[1].markers)).toEqual(['2'])
  })

  it('collects markers with no folder into ungrouped', () => {
    const { sections, ungrouped } = partitionByGroup([marker('1'), marker('2', null)], [group('a')])
    expect(labelsOf(ungrouped)).toEqual(['1', '2'])
    expect(sections[0].markers).toEqual([])
  })

  it('treats a marker whose folder no longer exists as ungrouped', () => {
    const { ungrouped } = partitionByGroup([marker('1', 'gone')], [group('a')])
    expect(labelsOf(ungrouped)).toEqual(['1'])
  })

  it('keeps folder order and returns an empty list for an empty folder', () => {
    const { sections } = partitionByGroup([], [group('b'), group('a')])
    expect(sections.map((section) => section.group.id)).toEqual(['b', 'a'])
    expect(sections[0].markers).toEqual([])
  })
})
