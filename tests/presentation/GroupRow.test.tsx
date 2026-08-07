import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { MarkerGroup } from '@/domain/group/MarkerGroup'

import { h } from '@/infrastructure/ui/react'
import { GroupRow } from '@/presentation/components/GroupRow'

function group(overrides: Partial<MarkerGroup> = {}): MarkerGroup {
  return { color: '#0a4d9c', hidden: false, id: 'g1', markerIds: ['m1', 'm2'], name: 'Line 1', ...overrides }
}

function renderRow(overrides: { count?: number, group?: MarkerGroup } = {}) {
  const handlers = {
    onDelete: vi.fn(),
    onOpen: vi.fn(),
    onRename: vi.fn(),
    onToggleHidden: vi.fn(),
  }
  render(
    <GroupRow
      count={overrides.count ?? 2}
      group={overrides.group ?? group()}
      onDelete={handlers.onDelete}
      onOpen={handlers.onOpen}
      onRename={handlers.onRename}
      onToggleHidden={handlers.onToggleHidden}
    />,
  )

  return handlers
}

describe('GroupRow', () => {
  it('shows the folder name and how many markers it holds', () => {
    renderRow({ count: 23 })
    expect(screen.getByLabelText<HTMLInputElement>('Folder name').value).toBe('Line 1')
    expect(screen.getByText('23')).toBeDefined()
  })

  // A folder is a line with dozens of stops: the row is a way in, not a place to
  // unfold them.
  it('shows no markers of its own', () => {
    renderRow()
    expect(screen.queryByLabelText('Marker name')).toBeNull()
  })

  it('opens the folder', () => {
    const { onOpen } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('renames the folder', () => {
    const { onRename } = renderRow()
    fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'Blue Line' } })
    expect(onRename).toHaveBeenCalledWith('Blue Line')
  })

  it('hides the folder from a visible state', () => {
    const { onToggleHidden } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Hide folder' }))
    expect(onToggleHidden).toHaveBeenCalledOnce()
  })

  it('offers to show a hidden folder again', () => {
    const { onToggleHidden } = renderRow({ group: group({ hidden: true }) })
    const button = screen.getByRole('button', { name: 'Show folder' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(button)
    expect(onToggleHidden).toHaveBeenCalledOnce()
  })

  it('removes the folder', () => {
    const { onDelete } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Remove folder' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('fades a folder that is hidden on the map', () => {
    renderRow({ group: group({ hidden: true }) })
    const row = screen.getByLabelText('Folder name').closest('div') as HTMLElement
    expect(row.style.opacity).toBe('0.6')
  })
})
