import { describe, expect, it } from 'vitest'

import { dropSideOf } from '@/presentation/hooks/useBoardOrdering'

function hover(clientY: number, top: number, height: number) {
  return { clientY, currentTarget: { getBoundingClientRect: () => ({ height, top }) } }
}

// Which half the pointer is in decides whether the dragged item lands above or below
// the one under it — the difference between "drop it here" and "drop it after this".
describe('dropSideOf', () => {
  it('reads the top half as dropping in front of the target', () => {
    expect(dropSideOf(hover(110, 100, 100))).toBe('before')
  })

  it('reads the bottom half as dropping behind the target', () => {
    expect(dropSideOf(hover(190, 100, 100))).toBe('after')
  })

  it('reads the exact middle as behind, so the two halves never both claim a pixel', () => {
    expect(dropSideOf(hover(150, 100, 100))).toBe('after')
  })

  it('works on a target scrolled away from the top of the page', () => {
    expect(dropSideOf(hover(920, 900, 100))).toBe('before')
    expect(dropSideOf(hover(980, 900, 100))).toBe('after')
  })
})
