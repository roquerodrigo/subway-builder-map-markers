// Which side of the item under the pointer a drop lands on.
export type DropSide = 'after' | 'before'

interface Identified {
  id: string
}

// Reordering is expressed as "put this one next to that one" rather than by index: the
// panel knows which card was dropped on which, and indices would have to be translated
// back and forth — through a list that is grouped into folders on screen but flat in
// the store, where the two don't line up.
//
// Every other item keeps its relative order, and an id that isn't in the list (or a
// move that changes nothing) returns the list untouched, so a stale drop is a no-op
// rather than a scramble.
export function moveAfter<T extends Identified>(items: T[], movedId: string, targetId: string): T[] {
  return move(items, movedId, targetId, 1)
}

export function moveBefore<T extends Identified>(items: T[], movedId: string, targetId: string): T[] {
  return move(items, movedId, targetId, 0)
}

function move<T extends Identified>(items: T[], movedId: string, targetId: string, offset: number): T[] {
  if (movedId === targetId) {
    return items
  }
  const moved = items.find((item) => item.id === movedId)
  if (!moved || !items.some((item) => item.id === targetId)) {
    return items
  }
  const remaining = items.filter((item) => item.id !== movedId)
  const target = remaining.findIndex((item) => item.id === targetId)

  return [...remaining.slice(0, target + offset), moved, ...remaining.slice(target + offset)]
}
