import type { DragEvent } from 'react'

import { h } from '@/infrastructure/ui/react'

export interface DragHandleProps {
  label: string
  onDragEnd: () => void
  onDragStart: (event: DragEvent<HTMLElement>) => void
}

// The grip that starts a reorder. Dragging is bound to the handle rather than to the
// whole row: a row is mostly text inputs, and making those draggable takes away
// selecting the text inside them.
export function DragHandle({ label, onDragEnd, onDragStart }: DragHandleProps): JSX.Element {
  return (
    <button
      aria-label={label}
      className="flex h-6 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-primary/10"
      draggable
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      style={{ cursor: 'grab' }}
      title={label}
      type="button"
    >
      <svg fill="currentColor" height="14" viewBox="0 0 24 24" width="14">
        <circle cx="9" cy="6" r="1.6" />
        <circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" />
        <circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" />
        <circle cx="15" cy="18" r="1.6" />
      </svg>
    </button>
  )
}
