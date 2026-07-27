import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MarkerStore } from '@/application/MarkerStore'
import type { SettingsStore } from '@/application/SettingsStore'
import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'
import type { MapMarkersController } from '@/infrastructure/map/MapMarkersController'
import type { PanelDependencies } from '@/presentation/PanelDependencies'
import type { SubwayBuilderApi } from '@/shared/game/SubwayBuilderApi'

import { DEFAULT_SETTINGS } from '@/domain/settings/MarkerSettings'
import { h } from '@/infrastructure/ui/react'
import { createMarkersPanel } from '@/presentation/MarkersPanel'

function createControllerDouble() {
  const listeners = new Set<(placing: boolean) => void>()
  let placing = false
  const setPlacing = (next: boolean): void => {
    placing = next
    listeners.forEach((listener) => listener(next))
  }

  return {
    cancelPlacement: vi.fn(() => setPlacing(false)),
    focus: vi.fn(),
    isPlacing: () => placing,
    onPlacementChange: (listener: (placing: boolean) => void) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    setPanelOpen: vi.fn(),
    togglePlacement: vi.fn(() => setPlacing(!placing)),
  }
}

function createMarker(id: string, label: string): Marker {
  return { color: '#ef4444', icon: 'station', id, label, position: [-46.63, -23.55] }
}

function createSettingsDouble() {
  return {
    get: () => DEFAULT_SETTINGS,
    subscribe: () => () => undefined,
    update: vi.fn(),
  }
}

function createStoreDouble(initial: Marker[] = [], initialGroups: MarkerGroup[] = []) {
  const listeners = new Set<() => void>()
  let markers = initial
  let groups = initialGroups
  let selectedId: null | string = null
  const notify = (): void => listeners.forEach((listener) => listener())

  return {
    addGroup: vi.fn((name: string) => {
      const group: MarkerGroup = { collapsed: false, color: null, hidden: false, id: `g${groups.length + 1}`, name }
      groups = [...groups, group]
      notify()

      return group
    }),
    all: () => markers,
    assignToGroup: vi.fn(),
    clear: vi.fn(() => {
      markers = []
      notify()
    }),
    groups: () => groups,
    remove: vi.fn(),
    removeGroup: vi.fn((id: string) => {
      groups = groups.filter((group) => group.id !== id)
      notify()
    }),
    renameGroup: vi.fn(),
    select: vi.fn((id: null | string) => {
      selectedId = id
      notify()
    }),
    selected: () => selectedId,
    subscribe: (listener: () => void) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    toggleGroupCollapsed: vi.fn((id: string) => {
      groups = groups.map((group) => (group.id === id ? { ...group, collapsed: !group.collapsed } : group))
      notify()
    }),
    toggleGroupHidden: vi.fn((id: string) => {
      groups = groups.map((group) => (group.id === id ? { ...group, hidden: !group.hidden } : group))
      notify()
    }),
    update: vi.fn(),
  }
}

function renderPanel(markers: Marker[] = [], groups: MarkerGroup[] = []) {
  const store = createStoreDouble(markers, groups)
  const controller = createControllerDouble()
  const settings = createSettingsDouble()
  const dependencies = {
    api: {} as SubwayBuilderApi,
    controller: controller as unknown as MapMarkersController,
    settings: settings as unknown as SettingsStore,
    store: store as unknown as MarkerStore,
  } satisfies PanelDependencies
  const MarkersPanel = createMarkersPanel(dependencies)
  const view = render(<MarkersPanel />)

  return { controller, settings, store, view }
}

const addButtonName = 'Add marker'
const placingButtonName = 'Click the map to place it (cancel)'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe('MarkersPanel tabs', () => {
  it('opens on the markers tab', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: 'Markers' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: addButtonName })).toBeDefined()
  })

  it('shows the display settings on the settings tab', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByLabelText('Influence radius')).toBeDefined()
    expect(screen.queryByRole('button', { name: addButtonName })).toBeNull()
  })

  it('cancels a pending placement when leaving the markers tab, since its cancel affordance lives there', () => {
    const { controller } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: addButtonName }))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(controller.cancelPlacement).toHaveBeenCalledOnce()
  })

  it('does not cancel placement when re-selecting the markers tab', () => {
    const { controller } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Markers' }))
    expect(controller.cancelPlacement).not.toHaveBeenCalled()
  })

  it('returns to the marker list from the settings tab', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Markers' }))
    expect(screen.getByRole('button', { name: addButtonName })).toBeDefined()
  })
})

describe('MarkersPanel placement', () => {
  it('asks the controller to toggle placement', () => {
    const { controller } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: addButtonName }))
    expect(controller.togglePlacement).toHaveBeenCalledOnce()
  })

  it('turns the button into a cancel affordance while placing', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: addButtonName }))
    expect(screen.getByRole('button', { name: placingButtonName })).toBeDefined()
    expect(screen.getByText('Click anywhere on the map to drop the marker.')).toBeDefined()
  })

  it('goes back to the idle hint once placement ends', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: addButtonName }))
    fireEvent.click(screen.getByRole('button', { name: placingButtonName }))
    expect(screen.getByRole('button', { name: addButtonName })).toBeDefined()
    expect(screen.getByText('Drag a marker on the map to move it.')).toBeDefined()
  })

  it('follows a placement finished on the map rather than in the panel', () => {
    const { controller } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: addButtonName }))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Markers' }))
    expect(controller.isPlacing()).toBe(false)
    expect(screen.getByRole('button', { name: addButtonName })).toBeDefined()
  })
})

describe('MarkersPanel lifecycle', () => {
  it('makes the markers live while it is open', () => {
    const { controller } = renderPanel()
    expect(controller.setPanelOpen).toHaveBeenCalledWith(true)
  })

  it('leaves no marker live, pending or highlighted once it closes', () => {
    const { controller, store, view } = renderPanel([createMarker('a', 'Central')])
    view.unmount()
    expect(controller.setPanelOpen).toHaveBeenLastCalledWith(false)
    expect(controller.cancelPlacement).toHaveBeenCalledOnce()
    expect(store.select).toHaveBeenCalledWith(null)
  })

  it('cancels a pending placement when it closes mid-placement', () => {
    const { controller, view } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: addButtonName }))
    view.unmount()
    expect(controller.cancelPlacement).toHaveBeenCalledOnce()
  })
})

describe('MarkersPanel marker list', () => {
  it('explains how to start when there are no markers', () => {
    renderPanel()
    expect(screen.getByText('No markers yet')).toBeDefined()
    expect(screen.getByText('Use “Add marker” to place your first one.')).toBeDefined()
  })

  it('renders one card per marker', () => {
    renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')])
    expect(screen.getAllByLabelText('Marker name')).toHaveLength(2)
    expect(screen.queryByText('No markers yet')).toBeNull()
  })

  it('removes the marker whose card asked for it', () => {
    const { store } = renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')])
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove marker' })[1])
    expect(store.remove).toHaveBeenCalledWith('b')
  })

  it('selects the marker whose badge was clicked', () => {
    const { store } = renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')])
    fireEvent.click(screen.getAllByRole('button', { name: 'Highlight marker on the map' })[1])
    expect(store.select).toHaveBeenCalledWith('b')
  })

  it('focuses the map on the marker whose card was clicked', () => {
    const { controller } = renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')])
    fireEvent.click(screen.getAllByRole('button', { name: 'Centre the map on this marker' })[1])
    expect(controller.focus).toHaveBeenCalledWith('b')
  })

  it('routes a card edit to the store under the right marker id', () => {
    const { store } = renderPanel([createMarker('a', 'Central')])
    fireEvent.change(screen.getByLabelText('Marker name'), { target: { value: 'Luz' } })
    expect(store.update).toHaveBeenCalledWith('a', { label: 'Luz' })
  })

  it('highlights the card of the marker selected on the map', () => {
    const { store } = renderPanel([createMarker('a', 'Central')])
    fireEvent.click(screen.getByRole('button', { name: 'Highlight marker on the map' }))
    expect(store.selected()).toBe('a')
    expect(screen.getByRole('button', { name: 'Highlight marker on the map' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('MarkersPanel remove all', () => {
  it('stays hidden while there is nothing to remove', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: /Remove all/ })).toBeNull()
  })

  it('counts the markers it would remove', () => {
    renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')])
    expect(screen.getByRole('button', { name: 'Remove all (2)' })).toBeDefined()
  })

  it('asks for confirmation inline instead of clearing on the first click', () => {
    const { store } = renderPanel([createMarker('a', 'Central')])
    fireEvent.click(screen.getByRole('button', { name: 'Remove all (1)' }))
    expect(store.clear).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm removal?' })).toBeDefined()
  })

  it('clears the markers on the confirming second click', () => {
    const { store } = renderPanel([createMarker('a', 'Central')])
    fireEvent.click(screen.getByRole('button', { name: 'Remove all (1)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal?' }))
    expect(store.clear).toHaveBeenCalledOnce()
    expect(screen.getByText('No markers yet')).toBeDefined()
  })

  it('abandons the confirmation when the button loses focus', () => {
    const { store } = renderPanel([createMarker('a', 'Central')])
    const button = screen.getByRole('button', { name: 'Remove all (1)' })
    fireEvent.click(button)
    fireEvent.blur(button)
    expect(screen.getByRole('button', { name: 'Remove all (1)' })).toBeDefined()
    expect(store.clear).not.toHaveBeenCalled()
  })
})

describe('MarkersPanel folders', () => {
  function grouped(id: string, label: string, groupId: string): Marker {
    return { ...createMarker(id, label), groupId }
  }

  const line1: MarkerGroup = { collapsed: false, color: '#0a4d9c', hidden: false, id: 'g1', name: 'Line 1' }

  it('offers no folder affordance on an empty board', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: /New folder/ })).toBeNull()
  })

  it('offers a New folder button once there are markers and creates one on click', () => {
    const { store } = renderPanel([createMarker('a', 'Central')])
    fireEvent.click(screen.getByRole('button', { name: /New folder/ }))
    expect(store.addGroup).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Folder name')).toBeDefined()
  })

  it('renders a card list flat while there are no folders', () => {
    renderPanel([createMarker('a', 'Central')])
    expect(screen.queryByLabelText('Folder name')).toBeNull()
    expect(screen.queryByLabelText('Move to folder')).toBeNull()
  })

  it('groups a marker under its folder header', () => {
    renderPanel([grouped('a', 'Central', 'g1')], [line1])
    expect(screen.getByLabelText<HTMLInputElement>('Folder name').value).toBe('Line 1')
    expect(screen.getByLabelText('Marker name')).toBeDefined()
  })

  it('shows an "Ungrouped" section for markers outside every folder', () => {
    renderPanel([grouped('a', 'Central', 'g1'), createMarker('b', 'Sé')], [line1])
    expect(screen.getByText('Ungrouped')).toBeDefined()
  })

  it('hides a folder from its header', () => {
    const { store } = renderPanel([grouped('a', 'Central', 'g1')], [line1])
    fireEvent.click(screen.getByRole('button', { name: 'Hide folder' }))
    expect(store.toggleGroupHidden).toHaveBeenCalledWith('g1')
  })

  it('removes a folder from its header', () => {
    const { store } = renderPanel([grouped('a', 'Central', 'g1')], [line1])
    fireEvent.click(screen.getByRole('button', { name: 'Remove folder' }))
    expect(store.removeGroup).toHaveBeenCalledWith('g1')
  })

  it('moves a marker to another folder from its card', () => {
    const { store } = renderPanel([grouped('a', 'Central', 'g1')], [line1])
    fireEvent.change(screen.getByLabelText('Move to folder'), { target: { value: '' } })
    expect(store.assignToGroup).toHaveBeenCalledWith('a', null)
  })

  it('persists a collapse through the store rather than local state', () => {
    const { store } = renderPanel([grouped('a', 'Central', 'g1')], [line1])
    fireEvent.click(screen.getByRole('button', { name: 'Collapse folder' }))
    expect(store.toggleGroupCollapsed).toHaveBeenCalledWith('g1')
  })

  it('renders a folder folded when the store says it is collapsed', () => {
    renderPanel([grouped('a', 'Central', 'g1')], [{ ...line1, collapsed: true }])
    expect(screen.queryByLabelText('Marker name')).toBeNull()
    expect(screen.getByRole('button', { name: 'Expand folder' })).toBeDefined()
  })
})
