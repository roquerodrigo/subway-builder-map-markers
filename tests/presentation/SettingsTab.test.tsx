import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SettingsStore } from '@/application/SettingsStore'
import type { MarkerSettings } from '@/domain/settings/MarkerSettings'

import { DEFAULT_SETTINGS } from '@/domain/settings/MarkerSettings'
import { h } from '@/infrastructure/ui/react'
import { SettingsTab } from '@/presentation/view/SettingsTab'

function createSettingsDouble(initial: Partial<MarkerSettings> = {}) {
  const listeners = new Set<() => void>()
  let settings: MarkerSettings = { ...DEFAULT_SETTINGS, ...initial }

  return {
    get: () => settings,
    subscribe: (listener: () => void) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    update: vi.fn((patch: Partial<MarkerSettings>) => {
      settings = { ...settings, ...patch }
      listeners.forEach((listener) => listener())
    }),
  }
}

function renderTab(initial: Partial<MarkerSettings> = {}) {
  const settings = createSettingsDouble(initial)
  render(<SettingsTab settings={settings as unknown as SettingsStore} />)

  return settings
}

describe('SettingsTab radius', () => {
  it('bounds the radius slider to the domain limits', () => {
    renderTab()
    const slider = screen.getByLabelText<HTMLInputElement>('Influence radius')
    expect(slider.type).toBe('range')
    expect(slider.min).toBe('100')
    expect(slider.max).toBe('2000')
    expect(slider.step).toBe('50')
    expect(slider.value).toBe('500')
  })

  it('summarises the default radius as its diameter across', () => {
    renderTab()
    expect(screen.getByText('500 m · 1 km across')).toBeDefined()
  })

  it('summarises a fractional diameter to one decimal', () => {
    renderTab({ radiusMeters: 750 })
    expect(screen.getByText('750 m · 1.5 km across')).toBeDefined()
  })

  it('summarises the largest radius', () => {
    renderTab({ radiusMeters: 2000 })
    expect(screen.getByText('2000 m · 4 km across')).toBeDefined()
  })

  it('writes a dragged radius to the store as a number', () => {
    const settings = renderTab()
    fireEvent.change(screen.getByLabelText('Influence radius'), { target: { value: '1200' } })
    expect(settings.update).toHaveBeenCalledWith({ radiusMeters: 1200 })
  })

  it('re-renders the summary from the store after a change', () => {
    renderTab()
    fireEvent.change(screen.getByLabelText('Influence radius'), { target: { value: '1000' } })
    expect(screen.getByText('1000 m · 2 km across')).toBeDefined()
  })
})

describe('SettingsTab idle opacity', () => {
  it('bounds the idle opacity slider to the domain limits', () => {
    renderTab()
    const slider = screen.getByLabelText<HTMLInputElement>('Opacity while the panel is closed')
    expect(slider.type).toBe('range')
    expect(slider.min).toBe('0')
    expect(slider.max).toBe('1')
    expect(slider.step).toBe('0.05')
    expect(slider.value).toBe('0.5')
  })

  it('summarises the default idle opacity as a percentage', () => {
    renderTab()
    expect(screen.getByText('50%')).toBeDefined()
  })

  it('spells out that a full idle opacity means no fading at all', () => {
    renderTab({ idleOpacity: 1 })
    expect(screen.getByText('100% · no fading')).toBeDefined()
  })

  // A bare "0%" reads like a broken overlay; saying it is hidden makes it a choice.
  it('spells out that a zero idle opacity hides the overlay', () => {
    renderTab({ idleOpacity: 0 })
    expect(screen.getByText('0% · hidden')).toBeDefined()
  })

  it('rounds an awkward idle opacity to a whole percentage', () => {
    renderTab({ idleOpacity: 0.15 })
    expect(screen.getByText('15%')).toBeDefined()
  })

  it('writes a dragged idle opacity to the store as a number', () => {
    const settings = renderTab()
    fireEvent.change(screen.getByLabelText('Opacity while the panel is closed'), { target: { value: '0.75' } })
    expect(settings.update).toHaveBeenCalledWith({ idleOpacity: 0.75 })
  })
})

describe('SettingsTab toggles', () => {
  const toggles: [string, keyof MarkerSettings][] = [
    ['Show influence area', 'showInfluence'],
    ['Show spacing guides', 'showSpacingGuide'],
    ['Magnetic snap', 'snapToSpacing'],
    ['Show names', 'showLabels'],
  ]

  it('renders every display toggle', () => {
    renderTab()
    // The four always-on display toggles plus the opt-in "name stations" toggle.
    expect(screen.getAllByRole('switch')).toHaveLength(toggles.length + 1)
  })

  it.each(toggles)('reflects the stored value of the %s toggle', (label, key) => {
    renderTab({ [key]: false })
    expect(screen.getByRole('switch', { name: label }).getAttribute('aria-checked')).toBe('false')
  })

  it.each(toggles)('turns the %s toggle off through the store', (label, key) => {
    const settings = renderTab()
    fireEvent.click(screen.getByRole('switch', { name: label }))
    expect(settings.update).toHaveBeenCalledWith({ [key]: false })
  })

  it.each(toggles)('turns the %s toggle back on through the store', (label, key) => {
    const settings = renderTab({ [key]: false })
    fireEvent.click(screen.getByRole('switch', { name: label }))
    expect(settings.update).toHaveBeenCalledWith({ [key]: true })
  })
})

describe('SettingsTab name-stations toggle', () => {
  const label = 'Name stations from markers'

  it('starts off, since it changes the game stations', () => {
    renderTab()
    expect(screen.getByRole('switch', { name: label }).getAttribute('aria-checked')).toBe('false')
  })

  it('reflects the stored value when it is on', () => {
    renderTab({ nameStationsFromMarkers: true })
    expect(screen.getByRole('switch', { name: label }).getAttribute('aria-checked')).toBe('true')
  })

  it('turns on through the store', () => {
    const settings = renderTab()
    fireEvent.click(screen.getByRole('switch', { name: label }))
    expect(settings.update).toHaveBeenCalledWith({ nameStationsFromMarkers: true })
  })

  it('turns off through the store', () => {
    const settings = renderTab({ nameStationsFromMarkers: true })
    fireEvent.click(screen.getByRole('switch', { name: label }))
    expect(settings.update).toHaveBeenCalledWith({ nameStationsFromMarkers: false })
  })
})
