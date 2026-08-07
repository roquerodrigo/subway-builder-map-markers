import type { DragEvent } from 'react'

import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { DropSide } from '@/domain/ordering/ItemOrder'

import { h } from '@/infrastructure/ui/react'
import { DragHandle } from '@/presentation/components/DragHandle'
import { dropIndicatorShadow } from '@/presentation/theme'

// A folder takes part in two drags at once: it can be reordered against the other
// folders, and it is where a marker dropped on it lands.
export interface GroupRowDrag {
  dragging: boolean
  hint: DropSide | null
  markerHovering: boolean
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onLeave: () => void
}

export interface GroupRowProps {
  count: number
  drag?: GroupRowDrag
  group: MarkerGroup
  onDelete: () => void
  onOpen: () => void
  onRename: (name: string) => void
  onToggleHidden: () => void
}

// One folder in the list of folders: its color, its name, how many markers it holds,
// and the actions that don't need its markers on screen. Opening it replaces the list
// with that folder's own view — folders hold hundreds of markers, and unfolding them
// in place buries every other folder.
export function GroupRow({ count, drag, group, onDelete, onOpen, onRename, onToggleHidden }: GroupRowProps): JSX.Element {
  const swatch = group.color ?? '#64748b'

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5"
      onDragLeave={drag?.onLeave}
      onDragOver={drag?.onDragOver}
      onDrop={drag?.onDrop}
      style={rowStyle(swatch, drag, group.hidden)}
    >
      {drag ?
          <DragHandle label="Reorder folder" onDragEnd={drag.onDragEnd} onDragStart={drag.onDragStart} /> :
        null}
      <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: swatch }} />
      <input
        aria-label="Folder name"
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold hover:border-border focus:border-border"
        onChange={(event) => onRename(event.target.value)}
        placeholder="Folder"
        value={group.name}
      />
      <span className="shrink-0 text-xs text-muted-foreground">{count}</span>
      <button
        aria-label={group.hidden ? 'Show folder' : 'Hide folder'}
        aria-pressed={group.hidden}
        className={
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md ' +
          (group.hidden ? 'bg-amber-500/20 text-amber-300' : 'bg-primary/10 text-muted-foreground hover:bg-primary/20')
        }
        onClick={onToggleHidden}
        title={group.hidden ? 'Show this folder on the map' : 'Hide this folder on the map'}
        type="button"
      >
        {group.hidden ? eyeOffIcon() : eyeIcon()}
      </button>
      <button
        aria-label="Remove folder"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25"
        onClick={onDelete}
        title="Remove folder (its markers are kept)"
        type="button"
      >
        <svg fill="none" height="15" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="15">
          <line x1="6" x2="18" y1="6" y2="18" />
          <line x1="18" x2="6" y1="6" y2="18" />
        </svg>
      </button>
      <button
        aria-label="Open folder"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-muted-foreground hover:bg-primary/20"
        onClick={onOpen}
        title="Open this folder"
        type="button"
      >
        <svg fill="none" height="15" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="15">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
    </div>
  )
}

function eyeIcon(): JSX.Element {
  return (
    <svg fill="none" height="15" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="15">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function eyeOffIcon(): JSX.Element {
  return (
    <svg fill="none" height="15" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="15">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" x2="23" y1="1" y2="23" />
    </svg>
  )
}

// A folder being reordered fades; one about to take a marker lights up in its own
// color, the same signal a card gives.
function rowStyle(swatch: string, drag: GroupRowDrag | undefined, hidden: boolean): Record<string, string> {
  const style: Record<string, string> = hidden ? { opacity: '0.6' } : {}
  if (!drag) {
    return style
  }
  if (drag.hint) {
    style.boxShadow = dropIndicatorShadow(drag.hint)
  }
  if (drag.markerHovering) {
    style.borderColor = swatch
    style.background = `${swatch}14`
  }
  if (drag.dragging) {
    style.opacity = '0.4'
  }

  return style
}
