import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { MarkerIcon } from '@/domain/marker/MarkerIconSet'

import { markerIcon } from '@/domain/marker/MarkerIconSet'
import { h } from '@/infrastructure/ui/react'
import { IconGlyph } from '@/presentation/components/IconGlyph'

const stationIcon = markerIcon('station')
const targetIcon = markerIcon('target')

function renderGlyph(icon: MarkerIcon, props: { color?: string, size?: number, strokeWidth?: number } = {}): SVGSVGElement {
  const { container } = render(<IconGlyph icon={icon} {...props} />)

  return container.querySelector('svg') as SVGSVGElement
}

describe('IconGlyph', () => {
  it('renders every primitive element of the icon, in order', () => {
    const svg = renderGlyph(stationIcon)
    const tags = [...svg.children].map((child) => child.tagName)
    expect(tags).toEqual(['rect', 'line', 'line', 'line'])
  })

  it('applies each primitive attribute to the rendered element', () => {
    const svg = renderGlyph(stationIcon)
    const rect = svg.querySelector('rect') as SVGRectElement
    expect(rect.getAttribute('x')).toBe('5')
    expect(rect.getAttribute('y')).toBe('4')
    expect(rect.getAttribute('width')).toBe('14')
    expect(rect.getAttribute('height')).toBe('12')
    expect(rect.getAttribute('rx')).toBe('3')
  })

  it('falls back to a stroke-only currentColor glyph at the default size', () => {
    const svg = renderGlyph(stationIcon)
    expect(svg.getAttribute('width')).toBe('18')
    expect(svg.getAttribute('height')).toBe('18')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.getAttribute('stroke-width')).toBe('2')
    expect(svg.getAttribute('fill')).toBe('none')
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
  })

  it('honours an explicit size and stroke width', () => {
    const svg = renderGlyph(stationIcon, { size: 32, strokeWidth: 1.5 })
    expect(svg.getAttribute('width')).toBe('32')
    expect(svg.getAttribute('height')).toBe('32')
    expect(svg.getAttribute('stroke-width')).toBe('1.5')
  })

  it('resolves a currentColor attribute to the given colour so filled parts tint too', () => {
    const svg = renderGlyph(targetIcon, { color: '#ef4444' })
    const filled = svg.querySelector('circle[fill]') as SVGCircleElement
    expect(filled.getAttribute('fill')).toBe('#ef4444')
    expect(svg.getAttribute('stroke')).toBe('#ef4444')
  })

  it('leaves attributes that are not currentColor untouched', () => {
    const svg = renderGlyph(targetIcon, { color: '#ef4444' })
    const outline = svg.querySelector('circle') as SVGCircleElement
    expect(outline.getAttribute('r')).toBe('8')
    expect(outline.getAttribute('fill')).toBeNull()
  })
})
