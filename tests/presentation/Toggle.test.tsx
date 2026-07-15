import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { h } from '@/infrastructure/ui/react'
import { Toggle } from '@/presentation/components/Toggle'

describe('Toggle', () => {
  it('renders the label and the optional description', () => {
    render(<Toggle checked={false} description="the why" label="Show names" onChange={vi.fn()} />)
    expect(screen.getByText('Show names')).toBeDefined()
    expect(screen.getByText('the why')).toBeDefined()
  })

  it('omits the description when there is none', () => {
    const { container } = render(<Toggle checked={false} label="Show names" onChange={vi.fn()} />)
    expect(container.querySelectorAll('div.text-xs')).toHaveLength(0)
  })

  it('exposes its state as a switch', () => {
    render(<Toggle checked label="Show names" onChange={vi.fn()} />)
    const toggle = screen.getByRole('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(toggle.getAttribute('aria-label')).toBe('Show names')
  })

  it('reports the flipped value, not the current one', () => {
    const onChange = vi.fn()
    render(<Toggle checked label="Show names" onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('turns on from off', () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} label="Show names" onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
