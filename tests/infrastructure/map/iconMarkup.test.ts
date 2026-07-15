import { describe, expect, it } from 'vitest'

import type { MarkerIcon } from '../../../src/domain/marker/MarkerIconSet'

import { markerIcon } from '../../../src/domain/marker/MarkerIconSet'
import { iconSvgMarkup } from '../../../src/infrastructure/map/iconMarkup'

const singleElementIcon: MarkerIcon = {
  key: 'probe',
  label: 'Probe',
  elements: [{ tag: 'circle', attrs: { cx: 12, cy: 12, r: 8 } }],
}

const filledIcon: MarkerIcon = {
  key: 'filled',
  label: 'Filled',
  elements: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 8 } },
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 1.6, fill: 'currentColor' } },
  ],
}

describe('iconSvgMarkup', () => {
  it('sizes the svg and strokes it with the requested color', () => {
    const markup = iconSvgMarkup(singleElementIcon, '#ffffff', 18)
    expect(markup).toContain('width="18"')
    expect(markup).toContain('height="18"')
    expect(markup).toContain('viewBox="0 0 24 24"')
    expect(markup).toContain('stroke="#ffffff"')
    expect(markup).toContain('fill="none"')
  })

  it('serializes an element with every attribute it declares', () => {
    expect(iconSvgMarkup(singleElementIcon, '#ffffff', 18)).toContain('<circle cx="12" cy="12" r="8" />')
  })

  it('serializes every element of a multi-part icon', () => {
    const markup = iconSvgMarkup(markerIcon('station'), '#ffffff', 18)
    expect(markup).toContain('<rect x="5" y="4" width="14" height="12" rx="3" />')
    expect(markup.match(/<line /g)).toHaveLength(3)
  })

  // The badge sits on the map canvas with no inherited CSS color, so `currentColor`
  // would resolve to nothing there and the filled parts would disappear.
  it('resolves currentColor to the requested color', () => {
    const markup = iconSvgMarkup(filledIcon, '#00ff00', 18)
    expect(markup).toContain('<circle cx="12" cy="12" r="1.6" fill="#00ff00" />')
    expect(markup).not.toContain('currentColor')
  })

  it('leaves a literal attribute value alone', () => {
    expect(iconSvgMarkup(markerIcon('flag'), '#ffffff', 18)).toContain('points="6 4 18 4 15 8 18 12 6 12"')
  })

  it('defaults the stroke width to 2', () => {
    expect(iconSvgMarkup(singleElementIcon, '#ffffff', 18)).toContain('stroke-width="2"')
  })

  it('accepts a custom stroke width', () => {
    expect(iconSvgMarkup(singleElementIcon, '#ffffff', 18, 1.5)).toContain('stroke-width="1.5"')
  })

  it('produces markup a browser can parse back into the same elements', () => {
    const host = document.createElement('div')
    host.innerHTML = iconSvgMarkup(markerIcon('target'), '#ffffff', 18)
    const svg = host.firstElementChild
    expect(svg?.tagName.toLowerCase()).toBe('svg')
    expect(svg?.querySelectorAll('circle')).toHaveLength(2)
  })

  it('renders an icon whose only element is a path', () => {
    const markup = iconSvgMarkup(markerIcon('star'), '#ffffff', 18)
    expect(markup.match(/<path /g)).toHaveLength(1)
  })
})
