import { describe, expect, it } from 'vitest'

import { CARD_CLASS, selectedCardStyle } from '@/presentation/theme'

describe('theme', () => {
  it('keeps the card spacing on the integer Tailwind steps the game ships', () => {
    expect(CARD_CLASS).toContain('space-y-2')
    expect(CARD_CLASS).not.toMatch(/\d\.\d/)
  })

  it('builds the selection style from the marker colour instead of a ring class', () => {
    expect(selectedCardStyle('#ef4444')).toEqual({
      background: '#ef44440f',
      borderColor: '#ef4444',
      boxShadow: 'inset 0 0 0 1px #ef4444',
    })
  })

  it('draws the selection ring inset so the scrolling list cannot clip it', () => {
    expect(selectedCardStyle('#3b82f6').boxShadow.startsWith('inset ')).toBe(true)
  })
})
