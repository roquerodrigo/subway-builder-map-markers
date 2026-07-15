import { describe, expect, it } from 'vitest'

import { DEFAULT_MARKER_COLOR, MARKER_COLORS } from '../../src/domain/marker/MarkerPalette'

describe('MARKER_COLORS', () => {
  it('offers something to choose from', () => {
    expect(MARKER_COLORS.length).toBeGreaterThan(1)
  })

  it('has no duplicate swatch', () => {
    expect(new Set(MARKER_COLORS).size).toBe(MARKER_COLORS.length)
  })

  // Both renderers drop the value straight into a style/paint property, so a stray
  // colour name or shorthand would reach the map unvalidated.
  it('states every swatch as a six-digit lowercase hex colour', () => {
    for (const color of MARKER_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('DEFAULT_MARKER_COLOR', () => {
  it('is one of the palette swatches', () => {
    expect(MARKER_COLORS).toContain(DEFAULT_MARKER_COLOR)
  })

  it('is stated in the same hex form as the palette', () => {
    expect(DEFAULT_MARKER_COLOR).toMatch(/^#[0-9a-f]{6}$/)
  })
})
