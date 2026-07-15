import type { MockInstance } from 'vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FloatingPanelRegistrar } from '@/infrastructure/ui/FloatingPanelRegistrar'

const LIFECYCLE_HOOKS = ['onGameInit', 'onCityLoad', 'onMapReady']

function createHooksDouble() {
  const callbacks = new Map<string, (argument?: string) => void>()
  const hooks: Record<string, (callback: (argument?: string) => void) => void> = {}
  for (const name of LIFECYCLE_HOOKS) {
    hooks[name] = vi.fn((callback) => callbacks.set(name, callback))
  }

  return { callbacks, hooks }
}

function createUiDouble() {
  return {
    addFloatingPanel: vi.fn(),
    unregisterComponent: vi.fn(),
  }
}

let consoleError: MockInstance

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('FloatingPanelRegistrar register', () => {
  it('registers the panel under the id and icon key the game expects', () => {
    const ui = createUiDouble()
    const render = vi.fn()
    new FloatingPanelRegistrar({ ui }, render, vi.fn()).register()
    expect(ui.addFloatingPanel).toHaveBeenCalledOnce()
    const config = ui.addFloatingPanel.mock.calls[0][0]
    expect(config.id).toBe('map-markers')
    expect(config.icon).toBe('MapPin')
    expect(config.title).toBe('Map Markers')
    expect(config.render).toBe(render)
  })

  it('unregisters the previous button before adding one, so the strip keeps a single button', () => {
    const ui = createUiDouble()
    new FloatingPanelRegistrar({ ui }, vi.fn(), vi.fn()).register()
    expect(ui.unregisterComponent).toHaveBeenCalledWith('top-bar', 'map-markers')
    expect(ui.unregisterComponent.mock.invocationCallOrder[0])
      .toBeLessThan(ui.addFloatingPanel.mock.invocationCallOrder[0])
  })

  it('still registers on the very first run, when there is nothing to unregister', () => {
    const ui = createUiDouble()
    ui.unregisterComponent.mockImplementation(() => {
      throw new Error('unknown component')
    })
    new FloatingPanelRegistrar({ ui }, vi.fn(), vi.fn()).register()
    expect(ui.addFloatingPanel).toHaveBeenCalledOnce()
  })

  it('registers against a host that has no unregisterComponent', () => {
    const addFloatingPanel = vi.fn()
    new FloatingPanelRegistrar({ ui: { addFloatingPanel } }, vi.fn(), vi.fn()).register()
    expect(addFloatingPanel).toHaveBeenCalledOnce()
  })

  it('disables itself with an error when the host exposes no ui namespace', () => {
    new FloatingPanelRegistrar({}, vi.fn(), vi.fn()).register()
    expect(consoleError).toHaveBeenCalledWith('[MapMarkers]', expect.stringContaining('mod disabled'))
  })

  it('disables itself with an error when the host cannot add a floating panel', () => {
    const ui = { addFloatingPanel: undefined, unregisterComponent: vi.fn() }
    new FloatingPanelRegistrar({ ui }, vi.fn(), vi.fn()).register()
    expect(consoleError).toHaveBeenCalledWith('[MapMarkers]', expect.stringContaining('mod disabled'))
    expect(ui.unregisterComponent).not.toHaveBeenCalled()
  })

  it('disables itself with an error when the host supplies no React', async () => {
    const host = globalThis as unknown as Record<string, unknown>
    const original = host.SubwayBuilderAPI
    host.SubwayBuilderAPI = undefined
    try {
      vi.resetModules()
      const module = await import('../../../src/infrastructure/ui/FloatingPanelRegistrar')
      const ui = createUiDouble()
      new module.FloatingPanelRegistrar({ ui }, vi.fn(), vi.fn()).register()
      expect(ui.addFloatingPanel).not.toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalledWith('[MapMarkers]', expect.stringContaining('React unavailable'))
    } finally {
      host.SubwayBuilderAPI = original
      vi.resetModules()
    }
  })
})

describe('FloatingPanelRegistrar lifecycle hooks', () => {
  it('does nothing when the host exposes no hooks', () => {
    expect(() => new FloatingPanelRegistrar({}, vi.fn(), vi.fn()).installLifecycleHooks()).not.toThrow()
  })

  it('subscribes to every lifecycle hook that rebuilds the top bar', () => {
    const { hooks } = createHooksDouble()
    new FloatingPanelRegistrar({ hooks, ui: createUiDouble() }, vi.fn(), vi.fn()).installLifecycleHooks()
    for (const name of LIFECYCLE_HOOKS) {
      expect(hooks[name]).toHaveBeenCalledOnce()
    }
  })

  it('re-registers the panel and re-syncs the map on a lifecycle event', () => {
    const { callbacks, hooks } = createHooksDouble()
    const ui = createUiDouble()
    const onLifecycle = vi.fn()
    new FloatingPanelRegistrar({ hooks, ui }, vi.fn(), onLifecycle).installLifecycleHooks()
    expect(ui.addFloatingPanel).not.toHaveBeenCalled()
    callbacks.get('onCityLoad')?.()
    expect(ui.addFloatingPanel).toHaveBeenCalledOnce()
    expect(onLifecycle).toHaveBeenCalledOnce()
  })

  it('re-registers on each lifecycle hook independently', () => {
    const { callbacks, hooks } = createHooksDouble()
    const ui = createUiDouble()
    new FloatingPanelRegistrar({ hooks, ui }, vi.fn(), vi.fn()).installLifecycleHooks()
    for (const name of LIFECYCLE_HOOKS) {
      callbacks.get(name)?.()
    }
    expect(ui.addFloatingPanel).toHaveBeenCalledTimes(LIFECYCLE_HOOKS.length)
  })

  it('skips a hook the host does not expose', () => {
    const { hooks } = createHooksDouble()
    const partial = { onMapReady: hooks.onMapReady }
    new FloatingPanelRegistrar({ hooks: partial, ui: createUiDouble() }, vi.fn(), vi.fn()).installLifecycleHooks()
    expect(hooks.onMapReady).toHaveBeenCalledOnce()
  })

  it('skips a hook entry that is not callable', () => {
    const hooks = { onCityLoad: vi.fn(), onGameInit: undefined, onMapReady: undefined }
    expect(() =>
      new FloatingPanelRegistrar({ hooks, ui: createUiDouble() }, vi.fn(), vi.fn()).installLifecycleHooks(),
    ).not.toThrow()
    expect(hooks.onCityLoad).toHaveBeenCalledOnce()
  })

  it('keeps installing the remaining hooks when one of them throws', () => {
    const { hooks } = createHooksDouble()
    hooks.onGameInit = vi.fn(() => {
      throw new Error('hook rejected')
    })
    new FloatingPanelRegistrar({ hooks, ui: createUiDouble() }, vi.fn(), vi.fn()).installLifecycleHooks()
    expect(hooks.onCityLoad).toHaveBeenCalledOnce()
    expect(hooks.onMapReady).toHaveBeenCalledOnce()
  })
})
