import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MARKER_COLORS } from '../../src/domain/marker/MarkerPalette'
import { h } from '../../src/infrastructure/ui/react'
import { ColorSwatches } from '../../src/presentation/components/ColorSwatches'

describe('ColorSwatches', () => {
  it('renders one swatch per palette colour', () => {
    render(<ColorSwatches onChange={vi.fn()} value="#ef4444" />)
    expect(screen.getAllByRole('button')).toHaveLength(MARKER_COLORS.length)
  })

  it('marks only the current colour as pressed', () => {
    render(<ColorSwatches onChange={vi.fn()} value="#22c55e" />)
    expect(screen.getByRole('button', { name: 'Choose color #22c55e' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Choose color #ef4444' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('matches the current colour regardless of hex casing', () => {
    render(<ColorSwatches onChange={vi.fn()} value="#EF4444" />)
    expect(screen.getByRole('button', { name: 'Choose color #ef4444' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('marks nothing when the current colour is outside the palette', () => {
    render(<ColorSwatches onChange={vi.fn()} value="#000000" />)
    const pressed = screen.getAllByRole('button').filter((button) => button.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(0)
  })

  it('reports the colour that was clicked', () => {
    const onChange = vi.fn()
    render(<ColorSwatches onChange={onChange} value="#ef4444" />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose color #8b5cf6' }))
    expect(onChange).toHaveBeenCalledWith('#8b5cf6')
  })
})
