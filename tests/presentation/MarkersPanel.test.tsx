import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
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
    setOpenFolder: vi.fn(),
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
      const group: MarkerGroup = { color: null, hidden: false, id: `g${groups.length + 1}`, markerIds: [], name }
      groups = [...groups, group]
      notify()

      return group
    }),
    addToGroup: vi.fn(),
    all: () => markers,
    clear: vi.fn(() => {
      markers = []
      notify()
    }),
    groups: () => groups,
    moveGroup: vi.fn(),
    moveMarker: vi.fn(),
    recolorGroup: vi.fn(),
    remove: vi.fn(),
    removeFromGroup: vi.fn(),
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
  const line1: MarkerGroup = { color: '#0a4d9c', hidden: false, id: 'g1', markerIds: ['a'], name: 'Line 1' }

  function grouped(id: string, label: string): Marker {
    return createMarker(id, label)
  }

  it('offers no folder affordance on an empty board', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: /New folder/ })).toBeNull()
  })

  // A folder is a line with dozens of stops, so the list of folders stays a list of
  // folders: opening one is what shows its markers.
  it('lists the folders without their markers', () => {
    renderPanel([grouped('a', 'Central')], [line1])
    expect(screen.getByLabelText<HTMLInputElement>('Folder name').value).toBe('Line 1')
    expect(screen.queryByLabelText('Marker name')).toBeNull()
  })

  it('opens a folder into a view of its own, and comes back', () => {
    renderPanel([grouped('a', 'Central')], [line1])
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    expect(screen.getByLabelText('Marker name')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Back to folders' }))
    expect(screen.queryByLabelText('Marker name')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open folder' })).toBeDefined()
  })

  it('shows one folder at a time', () => {
    const line2: MarkerGroup = { color: null, hidden: false, id: 'g2', markerIds: ['b'], name: 'Line 2' }
    renderPanel([grouped('a', 'Central'), grouped('b', 'Sé')], [line1, line2])
    fireEvent.click(screen.getAllByRole('button', { name: 'Open folder' })[0])
    expect(screen.getAllByLabelText('Marker name')).toHaveLength(1)
    expect(screen.getByLabelText<HTMLInputElement>('Folder name').value).toBe('Line 1')
  })

  // The map is where a marker is usually picked, and the panel has to follow it into
  // whichever folder holds it.
  it('follows the selection into the folder holding that marker', () => {
    const { store } = renderPanel([grouped('a', 'Central')], [line1])
    expect(screen.queryByLabelText('Marker name')).toBeNull()
    act(() => store.select('a'))
    expect(screen.getByLabelText('Marker name')).toBeDefined()
  })

  it('comes back out when a marker no folder holds is selected', () => {
    const { store } = renderPanel([grouped('a', 'Central'), createMarker('loose', 'Loose')], [line1])
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    act(() => store.select('loose'))
    expect(screen.getByRole('button', { name: 'Open folder' })).toBeDefined()
  })

  it('tells the map which folder is open, so a new marker joins it', () => {
    const { controller } = renderPanel([grouped('a', 'Central')], [line1])
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    expect(controller.setOpenFolder).toHaveBeenCalledWith('g1')
    fireEvent.click(screen.getByRole('button', { name: 'Back to folders' }))
    expect(controller.setOpenFolder).toHaveBeenLastCalledWith(null)
  })

  it('recolours the open folder', () => {
    const { store } = renderPanel([grouped('a', 'Central')], [line1])
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose color #22c55e' }))
    expect(store.recolorGroup).toHaveBeenCalledWith('g1', '#22c55e')
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
    expect(screen.queryByLabelText('Add to folder')).toBeNull()
  })

  it('shows an "Ungrouped" section for markers outside every folder', () => {
    renderPanel([grouped('a', 'Central'), createMarker('b', 'Sé')], [line1])
    expect(screen.getByText('Ungrouped')).toBeDefined()
  })

  it('hides a folder from its header', () => {
    const { store } = renderPanel([grouped('a', 'Central')], [line1])
    fireEvent.click(screen.getByRole('button', { name: 'Hide folder' }))
    expect(store.toggleGroupHidden).toHaveBeenCalledWith('g1')
  })

  it('removes a folder from its header', () => {
    const { store } = renderPanel([grouped('a', 'Central')], [line1])
    fireEvent.click(screen.getByRole('button', { name: 'Remove folder' }))
    expect(store.removeGroup).toHaveBeenCalledWith('g1')
  })

  it('takes a marker off a folder from its card', () => {
    const { store } = renderPanel([grouped('a', 'Central')], [line1])
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Show marker settings' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Take off Line 1' }))
    expect(store.removeFromGroup).toHaveBeenCalledWith('a', 'g1')
  })

  // An interchange is on every line that stops there, so a card can join a second
  // folder without leaving the first.
  it('puts a marker on a second folder from its card', () => {
    const line2: MarkerGroup = { color: null, hidden: false, id: 'g2', markerIds: [], name: 'Line 2' }
    const { store } = renderPanel([grouped('a', 'Central')], [line1, line2])
    fireEvent.click(screen.getAllByRole('button', { name: 'Open folder' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Show marker settings' })[0])
    fireEvent.change(screen.getAllByLabelText('Add to folder')[0], { target: { value: 'g2' } })
    expect(store.addToGroup).toHaveBeenCalledWith('a', 'g2')
  })
})

describe('MarkersPanel reordering', () => {
  const line1: MarkerGroup = { color: '#0a4d9c', hidden: false, id: 'g1', markerIds: ['b'], name: 'Line 1' }
  const line2: MarkerGroup = { color: '#e11d48', hidden: false, id: 'g2', markerIds: [], name: 'Line 2' }

  function grouped(id: string, label: string): Marker {
    return createMarker(id, label)
  }

  // jsdom lays nothing out, so every box is 0×0; giving the target a height is what
  // makes the half the pointer is in meaningful. jsdom also implements no DragEvent, so
  // a `clientY` passed to fireEvent never reaches the handler — it has to be defined on
  // the native event, which React then copies onto the synthetic one.
  function dropAt(element: HTMLElement, clientY: number, height = 100): void {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ height, top: 0 } as DOMRect)
    const event = createEvent.drop(element)
    Object.defineProperty(event, 'clientY', { value: clientY })
    fireEvent(element, event)
  }

  // The card is the element carrying the drop handlers, and the centring button is its
  // only direct child that is easy to name.
  function cards(): HTMLElement[] {
    return screen
      .getAllByRole('button', { name: 'Centre the map on this marker' })
      .map((backdrop) => backdrop.parentElement as HTMLElement)
  }

  function startDragging(name: string, index: number): void {
    fireEvent.dragStart(screen.getAllByRole('button', { name })[index], { dataTransfer: { setData: vi.fn() } })
  }

  it('drops a marker below the card it was dragged onto', () => {
    const { store } = renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')])
    startDragging('Reorder marker', 0)
    dropAt(cards()[1], 80)
    expect(store.moveMarker).toHaveBeenCalledWith(
      { from: null, markerId: 'a', to: null },
      { id: 'b', side: 'after' },
    )
  })

  it('drops a marker above the card it was dragged onto', () => {
    const { store } = renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')])
    startDragging('Reorder marker', 1)
    dropAt(cards()[0], 10)
    expect(store.moveMarker).toHaveBeenCalledWith(
      { from: null, markerId: 'b', to: null },
      { id: 'a', side: 'before' },
    )
  })

  it('ignores a marker dropped on itself', () => {
    const { store } = renderPanel([createMarker('a', 'Central')])
    startDragging('Reorder marker', 0)
    dropAt(cards()[0], 80)
    expect(store.moveMarker).toHaveBeenCalledWith(
      { from: null, markerId: 'a', to: null },
      { id: 'a', side: 'after' },
    )
  })

  it('drops a marker into the folder it was dragged onto', () => {
    const { store } = renderPanel([createMarker('a', 'Central'), grouped('b', 'Sé')], [line1])
    startDragging('Reorder marker', 0)
    dropAt(screen.getByLabelText('Folder name').closest('div') as HTMLElement, 0)
    expect(store.moveMarker).toHaveBeenCalledWith({ from: null, markerId: 'a', to: 'g1' })
  })

  // The drag started inside the folder, so that is the line the marker leaves.
  // The drag started inside the open folder, so that is the line the marker leaves.
  it('drops a marker onto the ungrouped list to take it off the folder it came from', () => {
    const { store } = renderPanel([createMarker('a', 'Central'), grouped('b', 'Sé')], [line1])
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    startDragging('Reorder marker', 0)
    fireEvent.click(screen.getByRole('button', { name: 'Back to folders' }))
    dropAt(screen.getByText('Ungrouped').parentElement as HTMLElement, 0)
    expect(store.moveMarker).toHaveBeenCalledWith({ from: 'g1', markerId: 'b', to: null })
  })

  it('reorders folders against each other', () => {
    const { store } = renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')], [line1, line2])
    startDragging('Reorder folder', 0)
    const target = screen.getAllByLabelText('Folder name')[1].closest('div') as HTMLElement
    dropAt(target, 80)
    expect(store.moveGroup).toHaveBeenCalledWith('g1', 'g2', 'after')
  })

  // A folder dropped on a folder reorders; a marker dropped on one joins it. Reading the
  // wrong one would either scramble the folders or swallow a marker.
  it('does not treat a dragged folder as a marker joining another folder', () => {
    const { store } = renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')], [line1, line2])
    startDragging('Reorder folder', 0)
    const target = screen.getAllByLabelText('Folder name')[1].closest('div') as HTMLElement
    dropAt(target, 10)
    expect(store.moveMarker).not.toHaveBeenCalled()
  })

  it('leaves the board alone when a drop lands with nothing being dragged', () => {
    const { store } = renderPanel([createMarker('a', 'Central')])
    dropAt(cards()[0], 10)
    expect(store.moveMarker).not.toHaveBeenCalled()
  })
})

describe('MarkersPanel reordering feedback', () => {
  const line1: MarkerGroup = { color: '#0a4d9c', hidden: false, id: 'g1', markerIds: ['a'], name: 'Line 1' }

  function grouped(id: string, label: string): Marker {
    return createMarker(id, label)
  }

  function cards(): HTMLElement[] {
    return screen
      .getAllByRole('button', { name: 'Centre the map on this marker' })
      .map((backdrop) => backdrop.parentElement as HTMLElement)
  }

  function dragOver(element: HTMLElement, clientY: number, height = 100): void {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ height, top: 0 } as DOMRect)
    const event = createEvent.dragOver(element)
    Object.defineProperty(event, 'clientY', { value: clientY })
    fireEvent(element, event)
  }

  function startDragging(name: string, index: number) {
    const dataTransfer = { effectAllowed: 'none', setData: vi.fn() }
    fireEvent.dragStart(screen.getAllByRole('button', { name })[index], { dataTransfer })

    return dataTransfer
  }

  // Firefox starts no drag at all unless dataTransfer carries something.
  it('seeds the drag with the id it is moving', () => {
    renderPanel([createMarker('a', 'Central')])
    const dataTransfer = startDragging('Reorder marker', 0)
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'a')
    expect(dataTransfer.effectAllowed).toBe('move')
  })

  it('fades the card being dragged', () => {
    renderPanel([createMarker('a', 'Central')])
    startDragging('Reorder marker', 0)
    expect(cards()[0].style.opacity).toBe('0.4')
  })

  it('draws a line on the edge the marker would land against', () => {
    renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')])
    startDragging('Reorder marker', 0)
    dragOver(cards()[1], 10)
    expect(cards()[1].style.boxShadow).toContain('-3px')
  })

  it('moves the line to the other edge in the lower half', () => {
    renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')])
    startDragging('Reorder marker', 0)
    dragOver(cards()[1], 90)
    expect(cards()[1].style.boxShadow).toContain('0 3px')
  })

  it('clears the line once the pointer leaves', () => {
    renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')])
    startDragging('Reorder marker', 0)
    dragOver(cards()[1], 10)
    fireEvent.dragLeave(cards()[1])
    expect(cards()[1].style.boxShadow).toBe('')
  })

  it('clears everything when the drag ends without a drop', () => {
    renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')])
    startDragging('Reorder marker', 0)
    dragOver(cards()[1], 10)
    fireEvent.dragEnd(screen.getAllByRole('button', { name: 'Reorder marker' })[0])
    expect(cards()[0].style.opacity).toBe('')
    expect(cards()[1].style.boxShadow).toBe('')
  })

  it('marks no drop target while nothing is being dragged', () => {
    renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')])
    dragOver(cards()[1], 10)
    expect(cards()[1].style.boxShadow).toBe('')
  })

  it('lights up the folder a marker is about to join', () => {
    renderPanel([createMarker('a', 'Central'), grouped('b', 'Sé')], [line1])
    const section = screen.getByLabelText('Folder name').closest('div') as HTMLElement
    startDragging('Reorder marker', 0)
    dragOver(section, 10)
    expect(section.style.borderColor).toBe('rgb(10, 77, 156)')
  })

  // The card offers a place in the middle of the folder; the folder offers its end.
  // Only one of them can be showing.
  it('does not light up the folder while a card offers the drop', () => {
    const empty: MarkerGroup = { color: null, hidden: false, id: 'g9', markerIds: [], name: 'Line 9' }
    renderPanel([createMarker('a', 'Central'), createMarker('b', 'Sé')], [empty])
    const section = screen.getByLabelText('Folder name').closest('div') as HTMLElement
    startDragging('Reorder marker', 0)
    dragOver(cards()[1], 10)
    expect(section.style.borderColor).toBe('')
  })

  it('outlines the ungrouped list when a marker is dragged over it', () => {
    const empty: MarkerGroup = { color: null, hidden: false, id: 'g9', markerIds: [], name: 'Line 9' }
    renderPanel([createMarker('a', 'Central')], [empty])
    startDragging('Reorder marker', 0)
    const ungrouped = screen.getByText('Ungrouped').parentElement as HTMLElement
    dragOver(ungrouped, 10)
    expect(ungrouped.style.boxShadow).toContain('inset')
  })

  // A board filed entirely into folders would otherwise carry a permanent empty
  // heading; the list is only useful as somewhere to drop a marker.
  // Empty, the ungrouped list is only somewhere to drop a marker, so it shows up while
  // one is being dragged and stays out of the way otherwise.
  it('keeps the empty ungrouped list out of the way until a marker is dragged', () => {
    renderPanel([grouped('a', 'Central')], [line1])
    expect(screen.queryByText('Ungrouped')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    startDragging('Reorder marker', 0)
    fireEvent.click(screen.getByRole('button', { name: 'Back to folders' }))
    expect(screen.getByText('Ungrouped')).toBeDefined()
  })

  it('always shows the ungrouped list when it has markers in it', () => {
    renderPanel([grouped('a', 'Central'), createMarker('b', 'Sé')], [line1])
    expect(screen.getByText('Ungrouped')).toBeDefined()
  })
})
