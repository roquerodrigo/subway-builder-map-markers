import type { DragEvent } from 'react'

import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'
import type { DropSide } from '@/domain/ordering/ItemOrder'
import type { MarkerCardDrag } from '@/presentation/components/MarkerCard'

import { h } from '@/infrastructure/ui/react'
import { DragHandle } from '@/presentation/components/DragHandle'
import { MarkerCard } from '@/presentation/components/MarkerCard'
import { dropIndicatorShadow } from '@/presentation/theme'

// A folder takes part in two drags at once: it can be reordered against the other
// folders, and it is where a marker dropped anywhere but on a card lands.
export interface GroupSectionDrag {
  cardDrag: (markerId: string) => MarkerCardDrag
  dragging: boolean
  hint: DropSide | null
  markerHovering: boolean
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onLeave: () => void
}

export interface GroupSectionProps {
  collapsed: boolean
  drag?: GroupSectionDrag
  group: MarkerGroup
  groups: MarkerGroup[]
  markers: Marker[]
  onAssign: (markerId: string, groupId: null | string) => void
  onDelete: () => void
  onFocus: (id: string) => void
  onRemove: (id: string) => void
  onRename: (name: string) => void
  onSelect: (id: string) => void
  onSortAlongPath: () => void
  onToggleCollapsed: () => void
  onToggleHidden: () => void
  onUpdate: (id: string, patch: Partial<Omit<Marker, 'id'>>) => void
  selectedId: null | string
}

// One folder in the marker list: a header (collapse, editable name, count, a per-folder
// hide toggle, remove) and, while expanded, the cards of its markers. Hiding a folder
// drops its markers off the map but keeps them here so they can be edited or shown
// again; removing a folder keeps its markers (they fall back to "no folder").
export function GroupSection(props: GroupSectionProps): JSX.Element {
  const { collapsed, drag, group, groups, markers, onAssign, onDelete, onFocus, onRemove, onRename, onSelect, onSortAlongPath, onToggleCollapsed, onToggleHidden, onUpdate, selectedId } = props
  const swatch = group.color ?? '#64748b'

  return (
    <div
      className="rounded-lg border border-border"
      onDragLeave={drag?.onLeave}
      onDragOver={drag?.onDragOver}
      onDrop={drag?.onDrop}
      style={sectionStyle(swatch, drag)}
    >
      <div className={'flex items-center gap-2 px-2 py-1.5 ' + (group.hidden ? 'opacity-60' : '')}>
        {drag ?
            <DragHandle label="Reorder folder" onDragEnd={drag.onDragEnd} onDragStart={drag.onDragStart} /> :
          null}
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand folder' : 'Collapse folder'}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-primary/10"
          onClick={onToggleCollapsed}
          type="button"
        >
          <svg
            fill="none"
            height="14"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 120ms ease' }}
            viewBox="0 0 24 24"
            width="14"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: swatch }} />
        <input
          aria-label="Folder name"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold hover:border-border focus:border-border"
          onChange={(event) => onRename(event.target.value)}
          placeholder="Folder"
          value={group.name}
        />
        <span className="shrink-0 text-xs text-muted-foreground">{markers.length}</span>
        <button
          aria-label="Sort markers along the path"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-muted-foreground hover:bg-primary/20 disabled:opacity-40"
          disabled={markers.length < 3}
          onClick={onSortAlongPath}
          title="Reorder this folder's markers along the shortest path — the order the line is drawn in"
          type="button"
        >
          {pathIcon()}
        </button>
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
      </div>

      {collapsed ?
        null :
          (
            <div className="space-y-2 px-2 pb-2">
              {markers.length === 0 ?
                  <p className="px-1 py-1 text-xs text-muted-foreground">Empty — drag markers in, or use their “Folder” picker.</p> :
                  markers.map((marker) => (
                    <MarkerCard
                      drag={drag?.cardDrag(marker.id)}
                      groups={groups}
                      key={marker.id}
                      marker={marker}
                      onAssign={(groupId) => onAssign(marker.id, groupId)}
                      onFocus={() => onFocus(marker.id)}
                      onRemove={() => onRemove(marker.id)}
                      onSelect={() => onSelect(marker.id)}
                      onUpdate={(patch) => onUpdate(marker.id, patch)}
                      selected={marker.id === selectedId}
                    />
                  ))}
            </div>
          )}
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

// The route the sort produces: a line bending through three stops.
function pathIcon(): JSX.Element {
  return (
    <svg fill="none" height="15" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="15">
      <path d="M4 18c6 0 4-12 10-12" strokeLinecap="round" />
      <circle cx="4" cy="18" fill="currentColor" r="2" stroke="none" />
      <circle cx="10.5" cy="12" fill="currentColor" r="2" stroke="none" />
      <circle cx="19" cy="6" fill="currentColor" r="2" stroke="none" />
    </svg>
  )
}

// A folder being reordered fades; a folder about to take a marker lights up in its own
// colour, which is the same signal a card gives, only around the whole section.
function sectionStyle(swatch: string, drag: GroupSectionDrag | undefined): Record<string, string> | undefined {
  if (!drag) {
    return undefined
  }
  const style: Record<string, string> = {}
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

  return Object.keys(style).length > 0 ? style : undefined
}
