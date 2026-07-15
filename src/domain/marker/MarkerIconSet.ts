// The curated set of marker glyphs. Each icon is a list of primitive SVG
// elements drawn in a 24×24 viewBox, stroke-based (fill: none, stroke:
// currentColor). Describing them as primitives — not raw path strings — lets both
// renderers build them safely: the React panel (IconGlyph.tsx via `h`) and the
// imperative map badge (a serialized SVG string). No renderer needs the game's
// icon set, so a marker looks identical everywhere.

export interface MarkerIcon {
  elements: SvgElement[]
  key: string
  label: string
}

export interface SvgElement {
  attrs: Record<string, number | string>
  tag: SvgTag
}

export type SvgTag = 'circle' | 'line' | 'path' | 'polyline' | 'rect'

export const MARKER_ICONS: MarkerIcon[] = [
  {
    elements: [
      { attrs: { height: 12, rx: 3, width: 14, x: 5, y: 4 }, tag: 'rect' },
      { attrs: { x1: 5, x2: 19, y1: 11, y2: 11 }, tag: 'line' },
      { attrs: { x1: 8, x2: 7, y1: 16, y2: 20 }, tag: 'line' },
      { attrs: { x1: 16, x2: 17, y1: 16, y2: 20 }, tag: 'line' },
    ],
    key: 'station',
    label: 'Station',
  },
  {
    elements: [
      { attrs: { height: 12, rx: 2, width: 16, x: 4, y: 4 }, tag: 'rect' },
      { attrs: { x1: 4, x2: 20, y1: 11, y2: 11 }, tag: 'line' },
      { attrs: { cx: 8, cy: 19, r: 1.6 }, tag: 'circle' },
      { attrs: { cx: 16, cy: 19, r: 1.6 }, tag: 'circle' },
    ],
    key: 'bus',
    label: 'Bus',
  },
  {
    elements: [
      { attrs: { points: '16 3 20 7 16 11' }, tag: 'polyline' },
      { attrs: { x1: 6, x2: 20, y1: 7, y2: 7 }, tag: 'line' },
      { attrs: { points: '8 13 4 17 8 21' }, tag: 'polyline' },
      { attrs: { x1: 18, x2: 4, y1: 17, y2: 17 }, tag: 'line' },
    ],
    key: 'interchange',
    label: 'Interchange',
  },
  {
    elements: [
      { attrs: { cx: 12, cy: 12, r: 8 }, tag: 'circle' },
      { attrs: { cx: 12, cy: 12, fill: 'currentColor', r: 1.6 }, tag: 'circle' },
    ],
    key: 'target',
    label: 'Point',
  },
  {
    elements: [
      {
        attrs: {
          d: 'M12 2.5 L14.35 8.76 L21.03 9.06 L15.8 13.24 L17.59 19.69 L12 16 L6.41 19.69 L8.2 13.24 L2.97 9.06 L9.65 8.76 Z',
        },
        tag: 'path',
      },
    ],
    key: 'star',
    label: 'Highlight',
  },
  {
    elements: [
      { attrs: { x1: 6, x2: 6, y1: 3, y2: 21 }, tag: 'line' },
      { attrs: { points: '6 4 18 4 15 8 18 12 6 12' }, tag: 'polyline' },
    ],
    key: 'flag',
    label: 'Flag',
  },
  {
    elements: [
      { attrs: { points: '3 11 12 4 21 11' }, tag: 'polyline' },
      { attrs: { points: '5 10 5 20 19 20 19 10' }, tag: 'polyline' },
      { attrs: { height: 6, width: 4, x: 10, y: 14 }, tag: 'rect' },
    ],
    key: 'home',
    label: 'Home',
  },
  {
    elements: [
      { attrs: { height: 12, rx: 2, width: 18, x: 3, y: 8 }, tag: 'rect' },
      { attrs: { d: 'M8 8 V6 a2 2 0 0 1 2 -2 h4 a2 2 0 0 1 2 2 v2' }, tag: 'path' },
      { attrs: { x1: 3, x2: 21, y1: 13, y2: 13 }, tag: 'line' },
    ],
    key: 'work',
    label: 'Work',
  },
]

const ICON_BY_KEY = new Map(MARKER_ICONS.map((icon) => [icon.key, icon]))

export const DEFAULT_MARKER_ICON = MARKER_ICONS[0].key

export function markerIcon(key: string): MarkerIcon {
  return ICON_BY_KEY.get(key) ?? MARKER_ICONS[0]
}
