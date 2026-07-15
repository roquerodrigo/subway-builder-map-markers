import type { Mock } from 'vitest'

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { h } from '@/infrastructure/ui/react'
import { MarkerCard } from '@/presentation/components/MarkerCard'
import { selectedCardStyle } from '@/presentation/theme'

const marker = {
  id: 'marker-1',
  position: [-46.63, -23.55] as [number, number],
  color: '#ef4444',
  icon: 'station',
  label: 'Central',
}

function renderCard(overrides: { selected?: boolean } = {}) {
  const handlers = {
    onFocus: vi.fn(),
    onRemove: vi.fn(),
    onSelect: vi.fn(),
    onUpdate: vi.fn(),
  }
  const { container } = render(
    <MarkerCard
      marker={marker}
      onFocus={handlers.onFocus}
      onRemove={handlers.onRemove}
      onSelect={handlers.onSelect}
      onUpdate={handlers.onUpdate}
      selected={overrides.selected ?? false}
    />,
  )
  return { ...handlers, card: container.firstElementChild as HTMLElement }
}

// jsdom implements no layout, so Element.prototype.scrollIntoView does not exist.
let scrollIntoView: Mock

beforeEach(() => {
  scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView
})

describe('MarkerCard', () => {
  it('shows the marker name in the editable label', () => {
    renderCard()
    expect(screen.getByLabelText<HTMLInputElement>('Marker name').value).toBe('Central')
  })

  it('reports a renamed marker through onUpdate', () => {
    const { onUpdate } = renderCard()
    fireEvent.change(screen.getByLabelText('Marker name'), { target: { value: 'Sé' } })
    expect(onUpdate).toHaveBeenCalledWith({ label: 'Sé' })
  })

  it('paints the badge with the marker colour and icon', () => {
    renderCard()
    const badge = screen.getByRole('button', { name: 'Highlight marker on the map' })
    expect(badge.style.background).toBe('rgb(239, 68, 68)')
    expect(badge.querySelectorAll('svg > *')).toHaveLength(4)
  })

  it('selects the marker when the badge is clicked', () => {
    const { onSelect } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Highlight marker on the map' }))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('reflects the selection on the badge', () => {
    renderCard({ selected: true })
    expect(screen.getByRole('button', { name: 'Highlight marker on the map' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('centres the map on the marker from the focus action', () => {
    const { onFocus } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Center on the map' }))
    expect(onFocus).toHaveBeenCalledOnce()
  })

  it('does not select the marker when only centring on it', () => {
    const { onFocus, onSelect } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Center on the map' }))
    expect(onFocus).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('removes the marker from the remove action', () => {
    const { onRemove } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Remove marker' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('does not select the marker when only removing it', () => {
    const { onRemove, onSelect } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Remove marker' }))
    expect(onRemove).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('styles a selected card inline, since the prebuilt Tailwind has no ring utilities', () => {
    const { card } = renderCard({ selected: true })
    const expected = selectedCardStyle(marker.color)
    expect(card.style.borderColor).toBe('rgb(239, 68, 68)')
    expect(card.style.boxShadow).toBe(expected.boxShadow)
    expect(card.style.background).toBe('rgba(239, 68, 68, 0.06)')
  })

  it('leaves an unselected card unstyled', () => {
    const { card } = renderCard()
    expect(card.getAttribute('style')).toBeNull()
  })

  it('scrolls a selected card into view, because selection often starts on the map', () => {
    renderCard({ selected: true })
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('leaves the list alone while the card is unselected', () => {
    renderCard()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('scrolls into view once the card becomes selected', () => {
    const { rerender } = render(
      <MarkerCard
        marker={marker}
        onFocus={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
        selected={false}
      />,
    )
    expect(scrollIntoView).not.toHaveBeenCalled()
    rerender(
      <MarkerCard
        marker={marker}
        onFocus={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
        selected
      />,
    )
    expect(scrollIntoView).toHaveBeenCalledOnce()
  })

  it('reports a recoloured marker through onUpdate', () => {
    const { onUpdate } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Choose color #22c55e' }))
    expect(onUpdate).toHaveBeenCalledWith({ color: '#22c55e' })
  })

  it('reports a new icon through onUpdate', () => {
    const { onUpdate } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }))
    expect(onUpdate).toHaveBeenCalledWith({ icon: 'star' })
  })
})
