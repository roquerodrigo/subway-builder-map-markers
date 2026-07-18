import type { Marker } from '@/domain/marker/Marker'
import type { PanelTab } from '@/presentation/components/TabBar'
import type { PanelDependencies } from '@/presentation/PanelDependencies'

import { partitionByGroup } from '@/domain/group/GroupPartition'
import { ensurePanelOnScreen } from '@/infrastructure/ui/PanelViewport'
import { Fragment, h, React } from '@/infrastructure/ui/react'
import { GroupSection } from '@/presentation/components/GroupSection'
import { MarkerCard } from '@/presentation/components/MarkerCard'
import { TabBar } from '@/presentation/components/TabBar'
import { useMarkers, usePlacement } from '@/presentation/hooks/useMarkers'
import { SettingsTab } from '@/presentation/view/SettingsTab'

// The panel content. Two tabs: the marker list (add/edit/remove markers, organize them
// into folders, hide a folder at a time — all wired to the shared MarkerStore) and the
// global display settings (the SettingsStore). Both stores are observed by the map
// layers, so the panel and the map never drift.
export function createMarkersPanel(dependencies: PanelDependencies): () => JSX.Element {
  const { controller, settings, store } = dependencies

  return function MarkersPanel(): JSX.Element {
    const { groups, markers, selectedId } = useMarkers(store)
    const placing = usePlacement(controller)
    const [tab, setTab] = React.useState<PanelTab>('markers')
    const [confirmClear, setConfirmClear] = React.useState(false)
    const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set())
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

    const toggleCollapsed = (id: string): void => {
      setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }

        return next
      })
    }

    const markerCard = (marker: Marker, withFolders: boolean): JSX.Element => (
      <MarkerCard
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

      return (
        <>
          {ungrouped.length > 0 ?
              (
                <div className="space-y-2">
                  <div className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Ungrouped</div>
                  {ungrouped.map((marker) => markerCard(marker, true))}
                </div>
              ) :
            null}
          {sections.map((section) => (
            <GroupSection
              collapsed={collapsed.has(section.group.id)}
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
              onToggleCollapsed={() => toggleCollapsed(section.group.id)}
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
