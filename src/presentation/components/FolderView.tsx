import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'
import type { MarkerCardDrag } from '@/presentation/components/MarkerCard'

import { h } from '@/infrastructure/ui/react'
import { ColorSwatches } from '@/presentation/components/ColorSwatches'
import { MarkerCard } from '@/presentation/components/MarkerCard'

export interface FolderViewProps {
  cardDrag?: (markerId: string) => MarkerCardDrag
  group: MarkerGroup
  groups: MarkerGroup[]
  markers: Marker[]
  // The folders each of this folder's markers is on: a marker where two lines meet is
  // on both, and its card says so.
  memberships: (markerId: string) => MarkerGroup[]
  onAddToGroup: (markerId: string, groupId: string) => void
  onBack: () => void
  onDelete: () => void
  onFocus: (id: string) => void
  onOpenGroup: (groupId: string) => void
  onRecolor: (color: string) => void
  onRemove: (id: string) => void
  onRemoveFromGroup: (markerId: string, groupId: string) => void
  onRename: (name: string) => void
  onSelect: (id: string) => void
  onSortAlongPath: () => void
  onToggleHidden: () => void
  onUpdate: (id: string, patch: Partial<Omit<Marker, 'id'>>) => void
  selectedId: null | string
}

// One folder on its own: the way back to the list, the folder's name and color, the
// actions that work on the whole line, and its markers in the order the line runs
// through them. A folder is a line with dozens of stops, so it gets the panel to itself
// rather than unfolding inside a list of other folders.
export function FolderView(props: FolderViewProps): JSX.Element {
  const { cardDrag, group, groups, markers, memberships, onAddToGroup, onBack, onDelete, onFocus, onOpenGroup, onRecolor, onRemove, onRemoveFromGroup, onRename, onSelect, onSortAlongPath, onToggleHidden, onUpdate, selectedId } = props
  const swatch = group.color ?? '#64748b'

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          aria-label="Back to folders"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-muted-foreground hover:bg-primary/20"
          onClick={onBack}
          title="Back to the folder list"
          type="button"
        >
          <svg fill="none" height="15" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="15">
            <polyline points="15 6 9 12 15 18" />
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

      {/* The folder's color is its line's color on the map, and what a marker created
          in the folder starts out as. */}
      <div className="rounded-lg border border-border px-2 py-1.5">
        <div className="mb-1 text-xs text-muted-foreground">Folder color</div>
        <ColorSwatches onChange={onRecolor} value={swatch} />
      </div>

      {markers.length === 0 ?
          <p className="px-1 py-1 text-xs text-muted-foreground">Empty — add a marker while this folder is open, or drop one on its line.</p> :
          markers.map((marker) => (
            <MarkerCard
              drag={cardDrag?.(marker.id)}
              groups={groups}
              key={marker.id}
              marker={marker}
              memberships={memberships(marker.id)}
              onAddToGroup={(groupId) => onAddToGroup(marker.id, groupId)}
              onFocus={() => onFocus(marker.id)}
              onOpenGroup={onOpenGroup}
              onRemove={() => onRemove(marker.id)}
              onRemoveFromGroup={(groupId) => onRemoveFromGroup(marker.id, groupId)}
              onSelect={() => onSelect(marker.id)}
              onUpdate={(patch) => onUpdate(marker.id, patch)}
              selected={marker.id === selectedId}
            />
          ))}
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
