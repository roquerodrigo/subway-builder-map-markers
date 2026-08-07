import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'

import { h } from '@/infrastructure/ui/react'
import { FolderView } from '@/presentation/components/FolderView'

function group(overrides: Partial<MarkerGroup> = {}): MarkerGroup {
  return { color: '#0a4d9c', hidden: false, id: 'g1', markerIds: [], name: 'Line 1', ...overrides }
}

function marker(id: string): Marker {
  return { color: '#ef4444', icon: 'station', id, label: id, position: [-46.63, -23.55] }
}

function renderSection(overrides: {
  group?: MarkerGroup
  groups?: MarkerGroup[]
  markers?: Marker[]
} = {}) {
  const handlers = {
    onAddToGroup: vi.fn(),
    onBack: vi.fn(),
    onDelete: vi.fn(),
    onFocus: vi.fn(),
    onRecolor: vi.fn(),
    onRemove: vi.fn(),
    onRemoveFromGroup: vi.fn(),
    onRename: vi.fn(),
    onSelect: vi.fn(),
    onSortAlongPath: vi.fn(),
    onToggleHidden: vi.fn(),
    onUpdate: vi.fn(),
  }
  const theGroup = overrides.group ?? group()
  render(
    <FolderView
      group={theGroup}
      groups={overrides.groups ?? [theGroup]}
      markers={overrides.markers ?? [marker('m1')]}
      memberships={() => [theGroup]}
      onAddToGroup={handlers.onAddToGroup}
      onBack={handlers.onBack}
      onDelete={handlers.onDelete}
      onFocus={handlers.onFocus}
      onRecolor={handlers.onRecolor}
      onRemove={handlers.onRemove}
      onRemoveFromGroup={handlers.onRemoveFromGroup}
      onRename={handlers.onRename}
      onSelect={handlers.onSelect}
      onSortAlongPath={handlers.onSortAlongPath}
      onToggleHidden={handlers.onToggleHidden}
      onUpdate={handlers.onUpdate}
      selectedId={null}
    />,
  )

  return handlers
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe('FolderView', () => {
  it('shows the folder name and its marker count', () => {
    renderSection({ markers: [marker('m1'), marker('m2')] })
    expect(screen.getByLabelText<HTMLInputElement>('Folder name').value).toBe('Line 1')
    expect(screen.getByText('2')).toBeDefined()
  })

  it('renders a card per marker while expanded', () => {
    renderSection({ markers: [marker('m1'), marker('m2')] })
    expect(screen.getAllByLabelText('Marker name')).toHaveLength(2)
  })

  it('explains an empty folder', () => {
    renderSection({ markers: [] })
    expect(screen.getByText(/Empty/)).toBeDefined()
  })

  it('goes back to the folder list', () => {
    const { onBack } = renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Back to folders' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  // The folder's color is its line's color on the map, and what a marker created in
  // the folder starts out as.
  it('recolours the folder', () => {
    const { onRecolor } = renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Choose color #22c55e' }))
    expect(onRecolor).toHaveBeenCalledWith('#22c55e')
  })

  it('renames the folder through onRename', () => {
    const { onRename } = renderSection()
    fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'Blue Line' } })
    expect(onRename).toHaveBeenCalledWith('Blue Line')
  })

  it('hides the folder from a visible state', () => {
    const { onToggleHidden } = renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Hide folder' }))
    expect(onToggleHidden).toHaveBeenCalledOnce()
  })

  it('offers to show a hidden folder again', () => {
    const { onToggleHidden } = renderSection({ group: group({ hidden: true }) })
    const button = screen.getByRole('button', { name: 'Show folder' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(button)
    expect(onToggleHidden).toHaveBeenCalledOnce()
  })

  it('removes the folder through onDelete', () => {
    const { onDelete } = renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Remove folder' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('takes a marker off this folder through onRemoveFromGroup', () => {
    const { onRemoveFromGroup } = renderSection({ markers: [marker('m1')] })
    fireEvent.click(screen.getAllByRole('button', { name: 'Show marker settings' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Take off Line 1' }))
    expect(onRemoveFromGroup).toHaveBeenCalledWith('m1', 'g1')
  })

  // The card lists every line a marker is on, so an interchange can be put on another
  // one without leaving this folder.
  it('puts a marker on another folder through onAddToGroup', () => {
    const other = group({ id: 'g2', name: 'Line 2' })
    const handlers = renderSection({ groups: [group(), other], markers: [marker('m1')] })
    fireEvent.click(screen.getAllByRole('button', { name: 'Show marker settings' })[0])
    fireEvent.change(screen.getByLabelText('Add to folder'), { target: { value: 'g2' } })
    expect(handlers.onAddToGroup).toHaveBeenCalledWith('m1', 'g2')
  })

  describe('sorting the folder along its path', () => {
    const label = 'Sort markers along the path'

    it('sorts through onSortAlongPath', () => {
      const { onSortAlongPath } = renderSection({ markers: [marker('m1'), marker('m2'), marker('m3')] })
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(onSortAlongPath).toHaveBeenCalledOnce()
    })

    // Under three markers there is only one path, so the action would do nothing.
    it.each([0, 1, 2])('is disabled with %i markers, where there is no order to find', (count) => {
      renderSection({ markers: Array.from({ length: count }, (_, index) => marker(`m${index}`)) })
      expect(screen.getByRole('button', { name: label })).toHaveProperty('disabled', true)
    })

    it('is offered as soon as three markers make an order possible', () => {
      renderSection({ markers: [marker('m1'), marker('m2'), marker('m3')] })
      expect(screen.getByRole('button', { name: label })).toHaveProperty('disabled', false)
    })
  })
})
