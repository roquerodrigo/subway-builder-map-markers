import type { DragEvent } from 'react'

import type { Marker } from '@/domain/marker/Marker'
import type { GroupSectionDrag } from '@/presentation/components/GroupSection'
import type { MarkerCardDrag } from '@/presentation/components/MarkerCard'
import type { PanelTab } from '@/presentation/components/TabBar'
import type { PanelDependencies } from '@/presentation/PanelDependencies'

import { partitionByGroup } from '@/domain/group/GroupPartition'
import { ensurePanelOnScreen } from '@/infrastructure/ui/PanelViewport'
import { Fragment, h, React } from '@/infrastructure/ui/react'
import { GroupSection } from '@/presentation/components/GroupSection'
import { MarkerCard } from '@/presentation/components/MarkerCard'
import { TabBar } from '@/presentation/components/TabBar'
import { dropSideOf, useBoardOrdering } from '@/presentation/hooks/useBoardOrdering'
import { useMarkers, usePlacement } from '@/presentation/hooks/useMarkers'
import { SettingsTab } from '@/presentation/view/SettingsTab'

// The ungrouped list is a drop target without being an item, so it needs an id of its
// own to hold the hover hint against. It can't collide with a marker or folder id,
// which are generated with a `m-`/`g-` prefix.
const UNGROUPED_DROP_ID = 'ungrouped'
const UNGROUPED_DROP_STYLE = { borderRadius: '0.5rem', boxShadow: 'inset 0 0 0 1px #3b82f6' }

// The panel content. Two tabs: the marker list (add/edit/remove markers, organize them
// into folders, hide a folder at a time — all wired to the shared MarkerStore) and the
// global display settings (the SettingsStore). Both stores are observed by the map
// layers, so the panel and the map never drift.
export function createMarkersPanel(dependencies: PanelDependencies): () => JSX.Element {
  const { controller, settings, store } = dependencies

  return function MarkersPanel(): JSX.Element {
    const { groups, markers, selectedId } = useMarkers(store)
    const placing = usePlacement(controller)
    const drag = useBoardOrdering()
    const [tab, setTab] = React.useState<PanelTab>('markers')
    const [confirmClear, setConfirmClear] = React.useState(false)
    const rootRef = React.useRef<HTMLDivElement>(null)

    // On open, make sure the game didn't restore the window off-screen (a stale
    // saved position can leave it unreachable). Runs before paint, so it never
    // flashes off-screen.
    React.useLayoutEffect(() => ensurePanelOnScreen(rootRef.current), [])

    // Markers are only live while the panel is open: on mount they become
    // draggable/clickable and fully opaque, and on unmount (panel closed) they drop
    // back to a passive, faded overlay. Closing also cancels any pending map-click
    // placement + crosshair cursor and clears the selection, so no badge is left
    // highlighted on the map.
    React.useEffect(() => {
      controller.setPanelOpen(true)

      return () => {
        controller.setPanelOpen(false)
        controller.cancelPlacement()
        store.select(null)
      }
    }, [])

    const switchTab = (next: PanelTab): void => {
      if (next !== 'markers') {
        controller.cancelPlacement() // its cancel affordance lives on the markers tab
      }
      setTab(next)
    }

    const clearAll = (): void => {
      if (!confirmClear) {
        setConfirmClear(true)

        return
      }
      store.clear()
      setConfirmClear(false)
    }

    // Dropping a marker on a card puts it there and hands it that card's folder;
    // dropping it on a folder appends it; dropping it on the ungrouped list takes it
    // out of every folder. A folder dropped on a folder reorders them.
    const cardDrag = (markerId: string): MarkerCardDrag => ({
      dragging: drag.dragged?.kind === 'marker' && drag.dragged.id === markerId,
      hint: drag.dragged?.kind === 'marker' && drag.hint?.id === markerId ? drag.hint.side : null,
      onDragEnd: drag.end,
      onDragLeave: () => drag.leave(markerId),
      onDragOver: (event) => {
        if (drag.dragged?.kind !== 'marker' || drag.dragged.id === markerId) {
          return
        }
        // The card sits inside its folder, which is a drop target of its own: without
        // this the folder would light up as if the marker were about to join it at the
        // end, while the card is offering a place in the middle.
        event.stopPropagation()
        event.preventDefault()
        drag.hover(markerId, dropSideOf(event))
      },
      onDragStart: (event) => drag.begin({ id: markerId, kind: 'marker' }, event),
      onDrop: (event) => {
        const dragged = drag.dragged
        drag.end()
        if (dragged?.kind !== 'marker') {
          return
        }
        event.stopPropagation()
        event.preventDefault()
        store.moveMarker(dragged.id, markerId, dropSideOf(event))
      },
    })

    const groupDrag = (groupId: string): GroupSectionDrag => ({
      cardDrag,
      dragging: drag.dragged?.kind === 'group' && drag.dragged.id === groupId,
      hint: drag.dragged?.kind === 'group' && drag.hint?.id === groupId ? drag.hint.side : null,
      markerHovering: drag.dragged?.kind === 'marker' && drag.hint?.id === groupId,
      onDragEnd: drag.end,
      onDragOver: (event) => {
        if (!drag.dragged || (drag.dragged.kind === 'group' && drag.dragged.id === groupId)) {
          return
        }
        event.preventDefault()
        drag.hover(groupId, drag.dragged.kind === 'group' ? dropSideOf(event) : 'after')
      },
      onDragStart: (event) => drag.begin({ id: groupId, kind: 'group' }, event),
      onDrop: (event) => {
        const dragged = drag.dragged
        drag.end()
        if (!dragged) {
          return
        }
        event.preventDefault()
        if (dragged.kind === 'group') {
          store.moveGroup(dragged.id, groupId, dropSideOf(event))
        } else {
          store.moveMarkerToGroup(dragged.id, groupId)
        }
      },
      onLeave: () => drag.leave(groupId),
    })

    const dropOutOfFolders = {
      onDragLeave: () => drag.leave(UNGROUPED_DROP_ID),
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (drag.dragged?.kind !== 'marker') {
          return
        }
        event.preventDefault()
        drag.hover(UNGROUPED_DROP_ID, 'after')
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        const dragged = drag.dragged
        drag.end()
        if (dragged?.kind !== 'marker') {
          return
        }
        event.preventDefault()
        store.moveMarkerToGroup(dragged.id, null)
      },
    }

    const markerCard = (marker: Marker, withFolders: boolean): JSX.Element => (
      <MarkerCard
        drag={cardDrag(marker.id)}
        groups={withFolders ? groups : undefined}
        key={marker.id}
        marker={marker}
        onAssign={withFolders ? (groupId) => store.assignToGroup(marker.id, groupId) : undefined}
        onFocus={() => controller.focus(marker.id)}
        onRemove={() => store.remove(marker.id)}
        onSelect={() => store.select(marker.id)}
        onUpdate={(patch) => store.update(marker.id, patch)}
        selected={marker.id === selectedId}
      />
    )

    const renderList = (): JSX.Element => {
      if (markers.length === 0) {
        return (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-muted-foreground">
            <div className="text-sm font-medium">No markers yet</div>
            <div className="text-xs">Use “Add marker” to place your first one.</div>
          </div>
        )
      }
      if (groups.length === 0) {
        return <>{markers.map((marker) => markerCard(marker, false))}</>
      }
      const { sections, ungrouped } = partitionByGroup(markers, groups)

      // Empty, this list is only somewhere to drop a marker — so it shows up while one
      // is being dragged and stays out of the way otherwise. A board filed entirely
      // into folders would otherwise carry a permanent empty heading.
      const showUngrouped = ungrouped.length > 0 || drag.dragged?.kind === 'marker'

      return (
        <>
          {showUngrouped ?
              (
                <div
                  className="space-y-2"
                  onDragLeave={dropOutOfFolders.onDragLeave}
                  onDragOver={dropOutOfFolders.onDragOver}
                  onDrop={dropOutOfFolders.onDrop}
                  style={drag.hint?.id === UNGROUPED_DROP_ID ? UNGROUPED_DROP_STYLE : undefined}
                >
                  <div className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Ungrouped</div>
                  {ungrouped.length === 0 ?
                      <p className="px-1 text-xs text-muted-foreground">Drop a marker here to take it out of its folder.</p> :
                      ungrouped.map((marker) => markerCard(marker, true))}
                </div>
              ) :
            null}
          {sections.map((section) => (
            <GroupSection
              collapsed={section.group.collapsed}
              drag={groupDrag(section.group.id)}
              group={section.group}
              groups={groups}
              key={section.group.id}
              markers={section.markers}
              onAssign={(markerId, groupId) => store.assignToGroup(markerId, groupId)}
              onDelete={() => store.removeGroup(section.group.id)}
              onFocus={(id) => controller.focus(id)}
              onRemove={(id) => store.remove(id)}
              onRename={(name) => store.renameGroup(section.group.id, name)}
              onSelect={(id) => store.select(id)}
              onToggleCollapsed={() => store.toggleGroupCollapsed(section.group.id)}
              onToggleHidden={() => store.toggleGroupHidden(section.group.id)}
              onUpdate={(id, patch) => store.update(id, patch)}
              selectedId={selectedId}
            />
          ))}
        </>
      )
    }

    return (
      <div className="flex h-full flex-col text-sm" ref={rootRef}>
        <TabBar onSelect={switchTab} tab={tab} />

        {tab === 'settings' ?
            (
              <div className="mt-3 min-h-0 flex-1 overflow-auto">
                <SettingsTab settings={settings} />
              </div>
            ) :
            (
              <div className="mt-3 flex min-h-0 flex-1 flex-col">
                <button
                  className={
                    'w-full rounded-md py-2 text-sm font-semibold transition ' +
                    (placing ?
                      'bg-amber-500/20 text-amber-300 cursor-pointer hover:bg-amber-500/30' :
                      'bg-primary text-primary-foreground cursor-pointer hover:opacity-90')
                  }
                  onClick={() => controller.togglePlacement()}
                  type="button"
                >
                  {placing ? 'Click the map to place it (cancel)' : 'Add marker'}
                </button>

                <p className="mt-2 text-xs text-muted-foreground">
                  {placing ?
                    'Click anywhere on the map to drop the marker.' :
                    'Drag a marker on the map to move it.'}
                </p>

                {markers.length > 0 || groups.length > 0 ?
                    (
                      <button
                        className="mt-2 w-full rounded-md border border-dashed border-border py-1.5 text-xs text-muted-foreground transition hover:bg-primary/10"
                        onClick={() => store.addGroup(`Folder ${groups.length + 1}`)}
                        type="button"
                      >
                        + New folder
                      </button>
                    ) :
                  null}

                <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto">
                  {renderList()}
                </div>

                {markers.length > 0 ?
                    (
                      <div className="mt-3 flex justify-end border-t border-border pt-3">
                        <button
                          className={
                            'rounded-md px-3 py-1.5 text-xs ' +
                            (confirmClear ?
                              'bg-red-500/25 text-red-300' :
                              'bg-primary/10 text-muted-foreground hover:bg-primary/20')
                          }
                          onBlur={() => setConfirmClear(false)}
                          onClick={clearAll}
                          type="button"
                        >
                          {confirmClear ? 'Confirm removal?' : `Remove all (${markers.length})`}
                        </button>
                      </div>
                    ) :
                  null}
              </div>
            )}
      </div>
    )
  }
}
