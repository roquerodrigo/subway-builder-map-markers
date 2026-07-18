import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'

import { h } from '@/infrastructure/ui/react'
import { GroupSection } from '@/presentation/components/GroupSection'

function group(overrides: Partial<MarkerGroup> = {}): MarkerGroup {
  return { color: '#0a4d9c', hidden: false, id: 'g1', name: 'Line 1', ...overrides }
}

function marker(id: string): Marker {
  return { color: '#ef4444', groupId: 'g1', icon: 'station', id, label: id, position: [-46.63, -23.55] }
}

function renderSection(overrides: {
  collapsed?: boolean
  group?: MarkerGroup
  markers?: Marker[]
} = {}) {
  const handlers = {
    onAssign: vi.fn(),
    onDelete: vi.fn(),
    onFocus: vi.fn(),
    onRemove: vi.fn(),
    onRename: vi.fn(),
    onSelect: vi.fn(),
    onToggleCollapsed: vi.fn(),
    onToggleHidden: vi.fn(),
    onUpdate: vi.fn(),
  }
  const theGroup = overrides.group ?? group()
  render(
    <GroupSection
      collapsed={overrides.collapsed ?? false}
      group={theGroup}
      groups={[theGroup]}
      markers={overrides.markers ?? [marker('m1')]}
      onAssign={handlers.onAssign}
      onDelete={handlers.onDelete}
      onFocus={handlers.onFocus}
      onRemove={handlers.onRemove}
      onRename={handlers.onRename}
      onSelect={handlers.onSelect}
      onToggleCollapsed={handlers.onToggleCollapsed}
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

describe('GroupSection', () => {
  it('shows the folder name and its marker count', () => {
    renderSection({ markers: [marker('m1'), marker('m2')] })
    expect(screen.getByLabelText<HTMLInputElement>('Folder name').value).toBe('Line 1')
    expect(screen.getByText('2')).toBeDefined()
  })

  it('renders a card per marker while expanded', () => {
    renderSection({ markers: [marker('m1'), marker('m2')] })
    expect(screen.getAllByLabelText('Marker name')).toHaveLength(2)
  })

  it('hides the cards while collapsed', () => {
    renderSection({ collapsed: true, markers: [marker('m1')] })
    expect(screen.queryByLabelText('Marker name')).toBeNull()
  })

  it('explains an empty folder', () => {
    renderSection({ markers: [] })
    expect(screen.getByText(/Empty/)).toBeDefined()
  })

  it('renames the folder through onRename', () => {
    const { onRename } = renderSection()
    fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'Blue Line' } })
    expect(onRename).toHaveBeenCalledWith('Blue Line')
  })

  it('collapses through onToggleCollapsed', () => {
    const { onToggleCollapsed } = renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse folder' }))
    expect(onToggleCollapsed).toHaveBeenCalledOnce()
  })

  it('offers an expand affordance while collapsed', () => {
    const { onToggleCollapsed } = renderSection({ collapsed: true })
    fireEvent.click(screen.getByRole('button', { name: 'Expand folder' }))
    expect(onToggleCollapsed).toHaveBeenCalledOnce()
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

  it('moves a marker to another folder through onAssign', () => {
    const { onAssign } = renderSection({ markers: [marker('m1')] })
    fireEvent.change(screen.getByLabelText('Move to folder'), { target: { value: '' } })
    expect(onAssign).toHaveBeenCalledWith('m1', null)
  })
})
