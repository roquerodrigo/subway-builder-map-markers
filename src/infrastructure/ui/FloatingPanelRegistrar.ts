import type { SubwayBuilderApi } from '@/shared/game/SubwayBuilderApi'

import { isReactAvailable } from '@/infrastructure/ui/react'
import { logger } from '@/shared/Logger'

const PANEL_ID = 'map-markers'
const LIFECYCLE_HOOKS = ['onGameInit', 'onCityLoad', 'onMapReady']

// Registers the native floating panel (a button in the mods strip + a draggable,
// resizable game-styled window). addFloatingPanel keeps the map interactive
// underneath (unlike addToolbarPanel's full-screen modal backdrop) — essential
// here, since the whole point is to drag markers on the map with the panel open.
// The game rebuilds the top bar during city load, wiping a mod-load-time
// registration, so re-register on the lifecycle hooks. Unregister-first keeps it
// to one button.
export class FloatingPanelRegistrar {
  constructor(
    private readonly api: SubwayBuilderApi,
    private readonly render: (props: { height?: number, width?: number }) => unknown,
    private readonly onLifecycle: () => void,
  ) {}

  installLifecycleHooks(): void {
    const hooks = this.api.hooks
    if (!hooks) {
      return
    }
    for (const name of LIFECYCLE_HOOKS) {
      const hook = hooks[name]
      if (typeof hook !== 'function') {
        continue
      }
      try {
        // Called on `hooks` rather than detached: the game is free to implement a
        // hook as a method that needs its receiver.
        hook.call(hooks, () => {
          this.register()
          this.onLifecycle()
        })
      } catch (error) {
        // The guard above already covers a missing hook, so anything landing here is
        // real — and silence would mean the panel quietly stops re-registering on a
        // city load, the very thing these hooks exist to prevent.
        logger.warn(`could not install the ${name} hook:`, error)
      }
    }
  }

  register(): void {
    const ui = this.api.ui
    if (!ui || typeof ui.addFloatingPanel !== 'function' || !isReactAvailable()) {
      logger.error('api.ui.addFloatingPanel / React unavailable — mod disabled.')

      return
    }
    try {
      ui.unregisterComponent?.('top-bar', PANEL_ID)
    } catch {
      /* first registration — nothing to unregister */
    }
    ui.addFloatingPanel({
      defaultHeight: 560,
      defaultWidth: 380,
      icon: 'MapPin',
      id: PANEL_ID,
      minHeight: 360,
      minWidth: 300,
      render: this.render,
      title: 'Map Markers',
      tooltip: 'Map Markers',
    })
  }
}
