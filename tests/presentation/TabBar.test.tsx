import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { h } from '../../src/infrastructure/ui/react'
import { TabBar } from '../../src/presentation/components/TabBar'

describe('TabBar', () => {
  it('renders one button per tab', () => {
    render(<TabBar onSelect={vi.fn()} tab="markers" />)
    expect(screen.getByRole('button', { name: 'Markers' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeDefined()
  })

  it('marks only the current tab as pressed', () => {
    render(<TabBar onSelect={vi.fn()} tab="settings" />)
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Markers' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('reports the key of the tab that was clicked', () => {
    const onSelect = vi.fn()
    render(<TabBar onSelect={onSelect} tab="markers" />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onSelect).toHaveBeenCalledWith('settings')
  })

  it('still reports a click on the tab that is already active', () => {
    const onSelect = vi.fn()
    render(<TabBar onSelect={onSelect} tab="markers" />)
    fireEvent.click(screen.getByRole('button', { name: 'Markers' }))
    expect(onSelect).toHaveBeenCalledWith('markers')
  })
})
