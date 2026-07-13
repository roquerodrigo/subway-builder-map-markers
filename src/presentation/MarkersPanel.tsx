import type { PanelTab } from './components/TabBar'
import type { PanelDependencies } from './PanelDependencies'

import { ensurePanelOnScreen } from '../infrastructure/ui/PanelViewport'
import { h, React } from '../infrastructure/ui/react'
import { MarkerCard } from './components/MarkerCard'
import { TabBar } from './components/TabBar'
import { useMarkers, usePlacement } from './hooks/useMarkers'
import { SettingsTab } from './view/SettingsTab'

// The panel content. Two tabs: the marker list (add/edit/remove, all wired to the
// shared MarkerStore) and the global display settings (the SettingsStore). Both
// stores are observed by the map layers, so the panel and the map never drift.
export function createMarkersPanel(dependencies: PanelDependencies): () => JSX.Element {
  const { store, controller, settings } = dependencies
  return function MarkersPanel(): JSX.Element {
    const { markers, selectedId } = useMarkers(store)
    const placing = usePlacement(controller)
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

                <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto">
                  {markers.length === 0 ?
                      (
                        <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-muted-foreground">
                          <div className="text-sm font-medium">No markers yet</div>
                          <div className="text-xs">Use “Add marker” to place your first one.</div>
                        </div>
                      ) :
                      markers.map((marker) => (
                        <MarkerCard
                          key={marker.id}
                          marker={marker}
                          onFocus={() => controller.focus(marker.id)}
                          onRemove={() => store.remove(marker.id)}
                          onSelect={() => store.select(marker.id)}
                          onUpdate={(patch) => store.update(marker.id, patch)}
                          selected={marker.id === selectedId}
                        />
                      ))}
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
