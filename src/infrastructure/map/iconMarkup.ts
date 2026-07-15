import type { MarkerIcon } from '@/domain/marker/MarkerIconSet'

// Serialize a marker icon to an SVG markup string for the imperative map badge
// (the React panel renders the same descriptors through IconGlyph instead). Only
// this mod's own constant descriptors are ever passed in, so the string is safe to
// assign as innerHTML. `currentColor` is resolved eagerly to `color` so a badge on
// the map — which has no inherited CSS color — still tints its filled parts.
export function iconSvgMarkup(icon: MarkerIcon, color: string, size: number, strokeWidth = 2): string {
  const inner = icon.elements
    .map((element) => {
      const attributes = Object.entries(element.attrs)
        .map(([name, value]) => `${name}="${value === 'currentColor' ? color : value}"`)
        .join(' ')

      return `<${element.tag} ${attributes} />`
    })
    .join('')

  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
  )
}
