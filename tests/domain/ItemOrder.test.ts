import { describe, expect, it } from 'vitest'

import { moveAfter, moveBefore } from '@/domain/ordering/ItemOrder'

function ids(items: { id: string }[]): string[] {
  return items.map((item) => item.id)
}

function list(...ids: string[]): { id: string }[] {
  return ids.map((id) => ({ id }))
}

describe('moveBefore', () => {
  it('puts the moved item directly in front of the target', () => {
    expect(ids(moveBefore(list('a', 'b', 'c'), 'c', 'b'))).toEqual(['a', 'c', 'b'])
  })

  it('moves an item forwards as well as backwards', () => {
    expect(ids(moveBefore(list('a', 'b', 'c'), 'a', 'c'))).toEqual(['b', 'a', 'c'])
  })

  it('keeps the order of everything it did not move', () => {
    expect(ids(moveBefore(list('a', 'b', 'c', 'd', 'e'), 'e', 'b'))).toEqual(['a', 'e', 'b', 'c', 'd'])
  })

  it('moves an item to the front', () => {
    expect(ids(moveBefore(list('a', 'b', 'c'), 'b', 'a'))).toEqual(['b', 'a', 'c'])
  })
})

describe('moveAfter', () => {
  it('puts the moved item directly behind the target', () => {
    expect(ids(moveAfter(list('a', 'b', 'c'), 'a', 'b'))).toEqual(['b', 'a', 'c'])
  })

  it('moves an item to the end', () => {
    expect(ids(moveAfter(list('a', 'b', 'c'), 'a', 'c'))).toEqual(['b', 'c', 'a'])
  })

  it('keeps the order of everything it did not move', () => {
    expect(ids(moveAfter(list('a', 'b', 'c', 'd'), 'b', 'd'))).toEqual(['a', 'c', 'd', 'b'])
  })
})

// A drop that changes nothing has to leave the list exactly as it was: the panel calls
// these straight from a drag, where dropping an item on itself, or on a card that just
// went away, is ordinary rather than exceptional.
describe('a move that cannot be made', () => {
  it('returns the list unchanged when an item is dropped on itself', () => {
    const items = list('a', 'b')
    expect(moveBefore(items, 'a', 'a')).toBe(items)
    expect(moveAfter(items, 'a', 'a')).toBe(items)
  })

  it('returns the list unchanged when the moved item is gone', () => {
    const items = list('a', 'b')
    expect(moveBefore(items, 'ghost', 'a')).toBe(items)
  })

  it('returns the list unchanged when the target is gone', () => {
    const items = list('a', 'b')
    expect(moveAfter(items, 'a', 'ghost')).toBe(items)
  })

  it('leaves the original list alone when it does move something', () => {
    const items = list('a', 'b', 'c')
    moveBefore(items, 'c', 'a')
    expect(ids(items)).toEqual(['a', 'b', 'c'])
  })
})
