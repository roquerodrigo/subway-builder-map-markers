import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MARKER_ICONS } from '@/domain/marker/MarkerIconSet'
import { h } from '@/infrastructure/ui/react'
import { IconPicker } from '@/presentation/components/IconPicker'

describe('IconPicker', () => {
  it('renders one button per icon, labelled with the icon name', () => {
    render(<IconPicker color="#ef4444" onChange={vi.fn()} value="station" />)
    expect(screen.getAllByRole('button')).toHaveLength(MARKER_ICONS.length)
    expect(screen.getByRole('button', { name: 'Interchange' })).toBeDefined()
  })

  it('marks only the current icon as pressed', () => {
    render(<IconPicker color="#ef4444" onChange={vi.fn()} value="bus" />)
    expect(screen.getByRole('button', { name: 'Bus' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Station' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('tints the current icon with the marker colour and leaves the rest inheriting', () => {
    render(<IconPicker color="#ef4444" onChange={vi.fn()} value="bus" />)
    const selected = screen.getByRole('button', { name: 'Bus' }).querySelector('svg')
    const unselected = screen.getByRole('button', { name: 'Station' }).querySelector('svg')
    expect(selected?.getAttribute('stroke')).toBe('#ef4444')
    expect(unselected?.getAttribute('stroke')).toBe('currentColor')
  })

  it('reports the key of the icon that was clicked', () => {
    const onChange = vi.fn()
    render(<IconPicker color="#ef4444" onChange={onChange} value="station" />)
    fireEvent.click(screen.getByRole('button', { name: 'Flag' }))
    expect(onChange).toHaveBeenCalledWith('flag')
  })

  it('marks nothing when the current icon key is unknown', () => {
    render(<IconPicker color="#ef4444" onChange={vi.fn()} value="not-an-icon" />)
    const pressed = screen.getAllByRole('button').filter((button) => button.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(0)
  })
})
