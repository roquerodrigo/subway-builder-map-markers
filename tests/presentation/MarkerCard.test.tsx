import type { Mock } from 'vitest'

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { h } from '@/infrastructure/ui/react'
import { MarkerCard } from '@/presentation/components/MarkerCard'
import { selectedCardStyle } from '@/presentation/theme'

const marker = {
  color: '#ef4444',
  icon: 'station',
  id: 'marker-1',
  label: 'Central',
  position: [-46.63, -23.55] as [number, number],
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

function openSettings(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Show marker settings' }))
}

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

  it('centres the map on the marker from the space around the controls', () => {
    const { onFocus } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Centre the map on this marker' }))
    expect(onFocus).toHaveBeenCalledOnce()
  })

  it('does not select the marker when only centring on it', () => {
    const { onFocus, onSelect } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Centre the map on this marker' }))
    expect(onFocus).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })

  // The centring button is stretched behind every control, so each one has to keep its
  // own click — centring the map instead of renaming a marker or picking a colour
  // would make the card unusable.
  it('does not centre the map when a control inside the card is used', () => {
    const { onFocus } = renderCard()
    fireEvent.click(screen.getByLabelText('Marker name'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove marker' }))
    fireEvent.click(screen.getByRole('button', { name: 'Highlight marker on the map' }))
    expect(onFocus).not.toHaveBeenCalled()
  })

  // A real button rather than a clickable card, so the keyboard and screen readers get
  // the behaviour for free instead of it being reimplemented on a <div>.
  it('exposes centring as a button, not as a click handler on the card', () => {
    const { card } = renderCard()
    const centre = screen.getByRole('button', { name: 'Centre the map on this marker' })
    expect(centre.tagName).toBe('BUTTON')
    expect(card.getAttribute('tabindex')).toBeNull()
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

  // The card positions the centring button behind it, so it always carries that much
  // style; what an unselected card must not carry is the selection colouring.
  it('leaves an unselected card without selection styling', () => {
    const { card } = renderCard()
    expect(card.style.background).toBe('')
    expect(card.style.borderColor).toBe('')
    expect(card.style.boxShadow).toBe('')
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
    openSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Choose color #22c55e' }))
    expect(onUpdate).toHaveBeenCalledWith({ color: '#22c55e' })
  })

  it('reports a new icon through onUpdate', () => {
    const { onUpdate } = renderCard()
    openSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }))
    expect(onUpdate).toHaveBeenCalledWith({ icon: 'star' })
  })
})

// On a board of hundreds of markers the pickers push every other card off the screen,
// so a card shows its name until its settings are asked for.
describe('MarkerCard settings toggle', () => {
  it('keeps the color and icon pickers out of the way to begin with', () => {
    renderCard()
    expect(screen.queryByRole('button', { name: 'Choose color #22c55e' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Highlight' })).toBeNull()
  })

  it('shows them when asked', () => {
    renderCard()
    openSettings()
    expect(screen.getByRole('button', { name: 'Choose color #22c55e' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Hide marker settings' })).toBeDefined()
  })

  it('hides them again', () => {
    renderCard()
    openSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Hide marker settings' }))
    expect(screen.queryByRole('button', { name: 'Choose color #22c55e' })).toBeNull()
  })

  // Clicking a badge on the map selects its card; landing on the marker's settings is
  // the point of going there.
  it('opens with the card that gets selected', () => {
    renderCard({ selected: true })
    expect(screen.getByRole('button', { name: 'Choose color #22c55e' })).toBeDefined()
  })

  it('still closes on a card that is selected', () => {
    renderCard({ selected: true })
    fireEvent.click(screen.getByRole('button', { name: 'Hide marker settings' }))
    expect(screen.queryByRole('button', { name: 'Choose color #22c55e' })).toBeNull()
  })
})

describe('MarkerCard folders', () => {
  const groups = [
    { collapsed: false, color: null, hidden: false, id: 'g1', markerIds: [], name: 'Line 1' },
    { collapsed: false, color: null, hidden: false, id: 'g2', markerIds: [], name: 'Line 2' },
  ]

  function renderWithFolders(memberships: typeof groups = []) {
    const onAddToGroup = vi.fn()
    const onRemoveFromGroup = vi.fn()
    render(
      <MarkerCard
        groups={groups}
        marker={marker}
        memberships={memberships}
        onAddToGroup={onAddToGroup}
        onFocus={vi.fn()}
        onRemove={vi.fn()}
        onRemoveFromGroup={onRemoveFromGroup}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
        selected={false}
      />,
    )

    openSettings()

    return { onAddToGroup, onRemoveFromGroup }
  }

  it('offers no folder controls when there are no folders', () => {
    renderCard()
    openSettings()
    expect(screen.queryByLabelText('Add to folder')).toBeNull()
  })

  it('says so when the marker is on no line yet', () => {
    renderWithFolders()
    expect(screen.getByText('None')).toBeDefined()
  })

  // A marker where two lines meet is on both, and the card has to show both.
  it('lists every folder the marker is on', () => {
    renderWithFolders(groups)
    expect(screen.getByText('Line 1')).toBeDefined()
    expect(screen.getByText('Line 2')).toBeDefined()
  })

  it('offers only the folders it is not on yet', () => {
    renderWithFolders([groups[0]])
    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['Add to folder…', 'Line 2'])
  })

  it('drops the picker once the marker is on every folder', () => {
    renderWithFolders(groups)
    expect(screen.queryByLabelText('Add to folder')).toBeNull()
  })

  it('puts the marker on another line through onAddToGroup', () => {
    const { onAddToGroup } = renderWithFolders()
    fireEvent.change(screen.getByLabelText('Add to folder'), { target: { value: 'g2' } })
    expect(onAddToGroup).toHaveBeenCalledWith('g2')
  })

  it('ignores the picker being reset to its placeholder', () => {
    const { onAddToGroup } = renderWithFolders()
    fireEvent.change(screen.getByLabelText('Add to folder'), { target: { value: '' } })
    expect(onAddToGroup).not.toHaveBeenCalled()
  })

  it('takes the marker off one line through onRemoveFromGroup', () => {
    const { onRemoveFromGroup } = renderWithFolders(groups)
    fireEvent.click(screen.getByRole('button', { name: 'Take off Line 2' }))
    expect(onRemoveFromGroup).toHaveBeenCalledWith('g2')
  })
})
