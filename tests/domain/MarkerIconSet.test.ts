import { describe, expect, it } from 'vitest'

import { DEFAULT_MARKER_ICON, MARKER_ICONS, markerIcon } from '../../src/domain/marker/MarkerIconSet'

const PRIMITIVE_TAGS = ['circle', 'line', 'path', 'polyline', 'rect']

describe('MARKER_ICONS', () => {
  it('offers something to choose from', () => {
    expect(MARKER_ICONS.length).toBeGreaterThan(1)
  })

  it('has no duplicate key', () => {
    const keys = MARKER_ICONS.map((icon) => icon.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('gives every icon a key and a label the picker can show', () => {
    for (const icon of MARKER_ICONS) {
      expect(icon.key).not.toBe('')
      expect(icon.label).not.toBe('')
    }
  })

  it('draws every icon from at least one element', () => {
    for (const icon of MARKER_ICONS) {
      expect(icon.elements.length).toBeGreaterThan(0)
    }
  })

  it('draws every icon from primitive svg tags only', () => {
    for (const icon of MARKER_ICONS) {
      for (const element of icon.elements) {
        expect(PRIMITIVE_TAGS).toContain(element.tag)
      }
    }
  })

  // Both renderers rebuild these attributes — the panel through `h`, the map badge
  // through a serialized SVG string — so anything that is not a plain number or
  // string would break one of them.
  it('describes every element with plain number or string attributes', () => {
    for (const icon of MARKER_ICONS) {
      for (const element of icon.elements) {
        expect(Object.keys(element.attrs).length).toBeGreaterThan(0)
        for (const value of Object.values(element.attrs)) {
          expect(['number', 'string']).toContain(typeof value)
        }
      }
    }
  })

  it('keeps every numeric attribute within the 24x24 viewBox range', () => {
    const numericAttributes = MARKER_ICONS.flatMap((icon) =>
      icon.elements.flatMap((element) =>
        Object.values(element.attrs).filter((value): value is number => typeof value === 'number'),
      ),
    )
    for (const value of numericAttributes) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(24)
    }
  })
})

describe('DEFAULT_MARKER_ICON', () => {
  it('is the first icon in the set', () => {
    expect(DEFAULT_MARKER_ICON).toBe(MARKER_ICONS[0].key)
  })

  it('resolves to a real icon', () => {
    expect(markerIcon(DEFAULT_MARKER_ICON)).toBe(MARKER_ICONS[0])
  })
})

describe('markerIcon', () => {
  it('resolves every key in the set to its own icon', () => {
    for (const icon of MARKER_ICONS) {
      expect(markerIcon(icon.key)).toBe(icon)
    }
  })

  it('resolves a key to the matching icon rather than to a position', () => {
    expect(markerIcon('flag').label).toBe('Flag')
  })

  // A marker stored by an older version can name an icon this build dropped; the
  // panel and the badge must still render something.
  it('falls back to the first icon for an unknown key', () => {
    expect(markerIcon('no-such-icon')).toBe(MARKER_ICONS[0])
  })

  it('falls back to the first icon for an empty key', () => {
    expect(markerIcon('')).toBe(MARKER_ICONS[0])
  })

  it('does not resolve inherited object properties as icons', () => {
    expect(markerIcon('constructor')).toBe(MARKER_ICONS[0])
    expect(markerIcon('toString')).toBe(MARKER_ICONS[0])
  })
})
