import { describe, expect, it } from 'vitest'

import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'

import { groupsHolding, partitionByGroup } from '@/domain/group/GroupPartition'

function group(id: string, markerIds: string[] = []): MarkerGroup {
  return { collapsed: false, color: null, hidden: false, id, markerIds, name: id }
}

function idsOf(markers: Marker[]): string[] {
  return markers.map((entry) => entry.id)
}

function marker(id: string): Marker {
  return { color: '#fff', icon: 'station', id, label: id, position: [0, 0] }
}

describe('partitionByGroup', () => {
  it('resolves each folder s marker ids, in the folder s own order', () => {
    const groups = [group('a', ['3', '1']), group('b', ['2'])]
    const markers = [marker('1'), marker('2'), marker('3')]
    const { sections } = partitionByGroup(markers, groups)
    expect(sections.map((section) => section.group.id)).toEqual(['a', 'b'])
    expect(idsOf(sections[0].markers)).toEqual(['3', '1'])
    expect(idsOf(sections[1].markers)).toEqual(['2'])
  })

  // An interchange is on every line that stops there, so it shows up under each of them.
  it('lists a marker under every folder holding it', () => {
    const groups = [group('a', ['1']), group('b', ['1'])]
    const { sections, ungrouped } = partitionByGroup([marker('1')], groups)
    expect(idsOf(sections[0].markers)).toEqual(['1'])
    expect(idsOf(sections[1].markers)).toEqual(['1'])
    expect(ungrouped).toEqual([])
  })

  it('collects the markers no folder holds into ungrouped, in board order', () => {
    const { sections, ungrouped } = partitionByGroup([marker('1'), marker('2')], [group('a', ['2'])])
    expect(idsOf(ungrouped)).toEqual(['1'])
    expect(idsOf(sections[0].markers)).toEqual(['2'])
  })

  // A folder holding an id whose marker is gone would otherwise leave a hole in the
  // line it draws.
  it('skips an id that matches no marker', () => {
    const { sections } = partitionByGroup([marker('1')], [group('a', ['1', 'removed'])])
    expect(idsOf(sections[0].markers)).toEqual(['1'])
  })

  it('keeps folder order and returns an empty list for an empty folder', () => {
    const { sections } = partitionByGroup([], [group('b'), group('a')])
    expect(sections.map((section) => section.group.id)).toEqual(['b', 'a'])
    expect(sections[0].markers).toEqual([])
  })
})

describe('groupsHolding', () => {
  it('lists every folder a marker is on, in board order', () => {
    const groups = [group('a', ['1']), group('b', ['2']), group('c', ['1'])]
    expect(groupsHolding('1', groups).map((held) => held.id)).toEqual(['a', 'c'])
  })

  it('is empty for a marker no folder holds', () => {
    expect(groupsHolding('1', [group('a', ['2'])])).toEqual([])
  })
})
