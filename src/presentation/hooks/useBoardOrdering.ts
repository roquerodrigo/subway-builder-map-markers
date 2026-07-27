import type { DropSide } from '@/domain/ordering/ItemOrder'

import { React } from '@/infrastructure/ui/react'

// What is being dragged, and what the pointer is currently over. Both live here rather
// than in the dragged/hovered components: only one drag runs at a time, and the drop
// target needs to know the kind of thing coming at it before the drop event (which is
// the only place `dataTransfer` can be read).
export interface BoardDrag {
  begin(item: DraggedItem, event: DragStart): void
  dragged: DraggedItem | null
  end(): void
  hint: DropHint | null
  hover(id: string, side: DropSide): void
  leave(id: string): void
}

export interface DraggedItem {
  id: string
  kind: DragKind
}

export type DragKind = 'group' | 'marker'

export interface DropHint {
  id: string
  side: DropSide
}

// Firefox starts no drag unless dataTransfer carries something.
interface DragStart {
  dataTransfer: null | { effectAllowed: string, setData(format: string, data: string): void }
}

// Which half of the hovered element the pointer is in — the difference between dropping
// above and below a card.
export function dropSideOf(event: { clientY: number, currentTarget: { getBoundingClientRect(): { height: number, top: number } } }): DropSide {
  const box = event.currentTarget.getBoundingClientRect()

  return event.clientY < box.top + box.height / 2 ? 'before' : 'after'
}

export function useBoardOrdering(): BoardDrag {
  const [dragged, setDragged] = React.useState<DraggedItem | null>(null)
  const [hint, setHint] = React.useState<DropHint | null>(null)

  return {
    begin: (item, event) => {
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', item.id)
      }
      setDragged(item)
    },
    dragged,
    end: () => {
      setDragged(null)
      setHint(null)
    },
    hint,
    hover: (id, side) => setHint((current) => (current?.id === id && current.side === side ? current : { id, side })),
    // Only the item being left clears the hint: dragging across a boundary fires the
    // new target's enter before the old one's leave, which would otherwise wipe it.
    leave: (id) => setHint((current) => (current?.id === id ? null : current)),
  }
}
