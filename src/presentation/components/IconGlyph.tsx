import type { MarkerIcon } from '../../domain/marker/MarkerIconSet'

import { h } from '../../infrastructure/ui/react'

export interface IconGlyphProps {
  icon: MarkerIcon
  color?: string
  size?: number
  strokeWidth?: number
}

// Renders a marker icon's primitive elements as an SVG. Mirrors the imperative
// map-badge serializer (iconSvgMarkup) so a marker looks identical in the panel
// and on the map. `currentColor` in an element is resolved to `color` eagerly, so
// filled parts tint correctly regardless of inherited CSS color.
export function IconGlyph({ icon, color = 'currentColor', size = 18, strokeWidth = 2 }: IconGlyphProps): JSX.Element {
  return (
    <svg
      fill="none"
      height={size}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      {icon.elements.map((element, index) => {
        const attrs: Record<string, number | string> = { key: index }
        for (const [name, value] of Object.entries(element.attrs)) {
          attrs[name] = value === 'currentColor' ? color : value
        }
        return h(element.tag, attrs)
      })}
    </svg>
  )
}
