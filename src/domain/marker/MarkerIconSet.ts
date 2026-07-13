// The curated set of marker glyphs. Each icon is a list of primitive SVG
// elements drawn in a 24×24 viewBox, stroke-based (fill: none, stroke:
// currentColor). Describing them as primitives — not raw path strings — lets both
// renderers build them safely: the React panel (IconGlyph.tsx via `h`) and the
// imperative map badge (a serialized SVG string). No renderer needs the game's
// icon set, so a marker looks identical everywhere.

export type SvgTag = 'circle' | 'line' | 'path' | 'polyline' | 'rect'

export interface SvgElement {
  tag: SvgTag
  attrs: Record<string, number | string>
}

export interface MarkerIcon {
  key: string
  label: string
  elements: SvgElement[]
}

export const MARKER_ICONS: MarkerIcon[] = [
  {
    key: 'station',
    label: 'Station',
    elements: [
      { tag: 'rect', attrs: { x: 5, y: 4, width: 14, height: 12, rx: 3 } },
      { tag: 'line', attrs: { x1: 5, y1: 11, x2: 19, y2: 11 } },
      { tag: 'line', attrs: { x1: 8, y1: 16, x2: 7, y2: 20 } },
      { tag: 'line', attrs: { x1: 16, y1: 16, x2: 17, y2: 20 } },
    ],
  },
  {
    key: 'bus',
    label: 'Bus',
    elements: [
      { tag: 'rect', attrs: { x: 4, y: 4, width: 16, height: 12, rx: 2 } },
      { tag: 'line', attrs: { x1: 4, y1: 11, x2: 20, y2: 11 } },
      { tag: 'circle', attrs: { cx: 8, cy: 19, r: 1.6 } },
      { tag: 'circle', attrs: { cx: 16, cy: 19, r: 1.6 } },
    ],
  },
  {
    key: 'interchange',
    label: 'Interchange',
    elements: [
      { tag: 'polyline', attrs: { points: '16 3 20 7 16 11' } },
      { tag: 'line', attrs: { x1: 6, y1: 7, x2: 20, y2: 7 } },
      { tag: 'polyline', attrs: { points: '8 13 4 17 8 21' } },
      { tag: 'line', attrs: { x1: 18, y1: 17, x2: 4, y2: 17 } },
    ],
  },
  {
    key: 'target',
    label: 'Point',
    elements: [
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 8 } },
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 1.6, fill: 'currentColor' } },
    ],
  },
  {
    key: 'star',
    label: 'Highlight',
    elements: [
      {
        tag: 'path',
        attrs: {
          d: 'M12 2.5 L14.35 8.76 L21.03 9.06 L15.8 13.24 L17.59 19.69 L12 16 L6.41 19.69 L8.2 13.24 L2.97 9.06 L9.65 8.76 Z',
        },
      },
    ],
  },
  {
    key: 'flag',
    label: 'Flag',
    elements: [
      { tag: 'line', attrs: { x1: 6, y1: 3, x2: 6, y2: 21 } },
      { tag: 'polyline', attrs: { points: '6 4 18 4 15 8 18 12 6 12' } },
    ],
  },
  {
    key: 'home',
    label: 'Home',
    elements: [
      { tag: 'polyline', attrs: { points: '3 11 12 4 21 11' } },
      { tag: 'polyline', attrs: { points: '5 10 5 20 19 20 19 10' } },
      { tag: 'rect', attrs: { x: 10, y: 14, width: 4, height: 6 } },
    ],
  },
  {
    key: 'work',
    label: 'Work',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 8, width: 18, height: 12, rx: 2 } },
      { tag: 'path', attrs: { d: 'M8 8 V6 a2 2 0 0 1 2 -2 h4 a2 2 0 0 1 2 2 v2' } },
      { tag: 'line', attrs: { x1: 3, y1: 13, x2: 21, y2: 13 } },
    ],
  },
]

const ICON_BY_KEY = new Map(MARKER_ICONS.map((icon) => [icon.key, icon]))

export const DEFAULT_MARKER_ICON = MARKER_ICONS[0].key

export function markerIcon(key: string): MarkerIcon {
  return ICON_BY_KEY.get(key) ?? MARKER_ICONS[0]
}
