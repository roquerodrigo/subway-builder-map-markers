import type { SubwayBuilderApi } from '../../shared/game/SubwayBuilderApi'

import { logger } from '../../shared/Logger'
import { isReactAvailable } from './react'

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
      if (typeof hook === 'function') {
        try {
          hook(() => {
            this.register()
            this.onLifecycle()
          })
        } catch {
          /* a missing hook is fine */
        }
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
      id: PANEL_ID,
      icon: 'MapPin',
      tooltip: 'Map Markers',
      title: 'Map Markers',
      defaultWidth: 380,
      defaultHeight: 560,
      minWidth: 300,
      minHeight: 360,
      render: this.render,
    })
  }
}
