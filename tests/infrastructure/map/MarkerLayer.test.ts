import type { Mock } from 'vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Marker } from '../../../src/domain/marker/Marker'
import type { MarkerLayerCallbacks, MarkerLayerView } from '../../../src/infrastructure/map/MarkerLayer'
import type { FakeGlMap } from './fakeGlMap'

import { MarkerLayer } from '../../../src/infrastructure/map/MarkerLayer'
import { createFakeGlMap, MAP_RECT_LEFT, MAP_RECT_TOP } from './fakeGlMap'

const OPEN: MarkerLayerView = { opacity: 1, showLabels: true }

interface BadgeParts {
  root: HTMLElement
  badge: HTMLElement
  label: HTMLElement
}

// jsdom re-serializes colors through its own CSS parser, so a literal hex never
// matches what comes back out; round-trip the expected value through the same parser.
function asCssColor(value: string): string {
  const probe = document.createElement('div')
  probe.style.background = value
  return probe.style.background
}

function makeMarker(overrides: Partial<Marker> = {}): Marker {
  return { id: 'alpha', position: [1, 2], color: '#ef4444', icon: 'station', label: 'Alpha', ...overrides }
}

function overlayOf(map: FakeGlMap): HTMLElement {
  const overlay = map.canvasContainer.querySelector<HTMLElement>('.sbmm-marker-overlay')
  if (!overlay) {
    throw new Error('the layer drew no overlay')
  }
  return overlay
}

function badgesOf(map: FakeGlMap): BadgeParts[] {
  return Array.from(overlayOf(map).children).map((child) => {
    const root = child as HTMLElement
    return { root, badge: root.children[0] as HTMLElement, label: root.children[1] as HTMLElement }
  })
}

function pressOn(target: HTMLElement, init: PointerEventInit = {}): PointerEvent {
  const event = new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

function movePointerTo(clientX: number, clientY: number): void {
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX, clientY, pointerId: 1 }))
}

function releasePointer(type: 'pointercancel' | 'pointerup' = 'pointerup'): void {
  window.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1 }))
}

describe('MarkerLayer', () => {
  let callbacks: {
    onClick: Mock<(id: string) => void>
    onDragEnd: Mock<(id: string, position: [number, number]) => void>
    onDragMove: Mock<(id: string, position: [number, number]) => void>
  }
  let cancelFrame: Mock<(handle: number) => void>
  let frames: Map<number, FrameRequestCallback>
  let nextFrameHandle: number
  let map: FakeGlMap
  let currentMap: FakeGlMap | null

  // The layer coalesces drag moves onto an animation frame, so a test has to decide
  // when that frame runs; a real rAF would fire on its own schedule. A cancelled
  // frame has to actually disappear from the queue, or a test would still see the
  // report the layer took care to drop.
  function flushFrames(): void {
    const pending = [...frames.values()]
    frames.clear()
    for (const frame of pending) {
      frame(0)
    }
  }

  function makeLayer(overrides: Partial<MarkerLayerCallbacks> = {}): MarkerLayer {
    return new MarkerLayer(() => currentMap, { ...callbacks, ...overrides })
  }

  beforeEach(() => {
    frames = new Map()
    nextFrameHandle = 1
    cancelFrame = vi.fn((handle: number): void => {
      frames.delete(handle)
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
      const handle = nextFrameHandle++
      frames.set(handle, callback)
      return handle
    })
    vi.stubGlobal('cancelAnimationFrame', cancelFrame)
    callbacks = { onClick: vi.fn(), onDragEnd: vi.fn(), onDragMove: vi.fn() }
    map = createFakeGlMap()
    currentMap = map
  })

  afterEach(() => {
    // A drag left open by a test keeps its listeners on window, where the next test
    // would dispatch straight into them.
    releasePointer()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  describe('drawing', () => {
    it('appends its overlay to the map canvas container', () => {
      makeLayer().render([makeMarker()], null, OPEN)
      expect(overlayOf(map).parentElement).toBe(map.canvasContainer)
    })

    it('gives every marker a badge and a label', () => {
      makeLayer().render([makeMarker(), makeMarker({ id: 'beta', label: 'Beta' })], null, OPEN)
      const badges = badgesOf(map)
      expect(badges).toHaveLength(2)
      expect(badges[0].label.textContent).toBe('Alpha')
      expect(badges[1].label.textContent).toBe('Beta')
    })

    it('places each badge at the projected pixel of its position', () => {
      makeLayer().render([makeMarker({ position: [1, 2] })], null, OPEN)
      expect(badgesOf(map)[0].root.style.transform).toBe('translate3d(100px, -200px, 0)')
    })

    it('paints the badge with the marker color and its icon glyph', () => {
      makeLayer().render([makeMarker({ color: '#ef4444', icon: 'target' })], null, OPEN)
      const { badge } = badgesOf(map)[0]
      expect(badge.style.background).toBe(asCssColor('#ef4444'))
      expect(badge.querySelectorAll('circle')).toHaveLength(2)
    })

    it('falls back to a known glyph when the icon is unknown', () => {
      makeLayer().render([makeMarker({ icon: 'not-a-real-icon' })], null, OPEN)
      expect(badgesOf(map)[0].badge.querySelector('svg')).not.toBeNull()
    })

    it('fades the whole overlay to the requested opacity', () => {
      makeLayer().render([makeMarker()], null, { opacity: 0.35, showLabels: true })
      expect(overlayOf(map).style.opacity).toBe('0.35')
    })

    it('does nothing at all while the game has no map', () => {
      currentMap = null
      expect(() => makeLayer().render([makeMarker()], null, OPEN)).not.toThrow()
      expect(map.canvasContainer.children).toHaveLength(0)
    })
  })

  describe('selection', () => {
    it('enlarges and rings the selected marker', () => {
      makeLayer().render([makeMarker({ color: '#ef4444' })], 'alpha', OPEN)
      const { badge } = badgesOf(map)[0]
      expect(badge.style.transform).toBe('translate(-50%, -50%) scale(1.14)')
      expect(badge.style.zIndex).toBe('2')
      expect(badge.style.boxShadow).toContain('#ef444466')
    })

    it('leaves an unselected marker plain', () => {
      makeLayer().render([makeMarker()], 'somebody-else', OPEN)
      const { badge } = badgesOf(map)[0]
      expect(badge.style.transform).toBe('translate(-50%, -50%)')
      expect(badge.style.zIndex).toBe('1')
    })
  })

  describe('labels', () => {
    it('shows the label of a named marker', () => {
      makeLayer().render([makeMarker({ label: 'Alpha' })], null, OPEN)
      expect(badgesOf(map)[0].label.style.display).toBe('block')
    })

    it('hides every label while names are turned off', () => {
      makeLayer().render([makeMarker({ label: 'Alpha' })], null, { opacity: 1, showLabels: false })
      expect(badgesOf(map)[0].label.style.display).toBe('none')
    })

    it('hides the label of a marker whose name is only whitespace', () => {
      makeLayer().render([makeMarker({ label: '   ' })], null, OPEN)
      const { label } = badgesOf(map)[0]
      expect(label.style.display).toBe('none')
      expect(label.textContent).toBe('')
    })
  })

  describe('reconciling', () => {
    it('adds an element for a marker that appears', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], null, OPEN)
      layer.render([makeMarker(), makeMarker({ id: 'beta' })], null, OPEN)
      expect(badgesOf(map)).toHaveLength(2)
    })

    it('reuses the existing element when a marker changes', () => {
      const layer = makeLayer()
      layer.render([makeMarker({ color: '#ef4444' })], null, OPEN)
      const before = badgesOf(map)[0].root
      layer.render([makeMarker({ color: '#22c55e', label: 'Renamed' })], null, OPEN)
      const after = badgesOf(map)[0]
      expect(after.root).toBe(before)
      expect(after.badge.style.background).toBe(asCssColor('#22c55e'))
      expect(after.label.textContent).toBe('Renamed')
    })

    it('removes the element of a marker that is gone', () => {
      const layer = makeLayer()
      layer.render([makeMarker(), makeMarker({ id: 'beta' })], null, OPEN)
      layer.render([makeMarker({ id: 'beta' })], null, OPEN)
      expect(badgesOf(map)).toHaveLength(1)
      expect(badgesOf(map)[0].label.textContent).toBe('Alpha')
    })

    it('drops the badges of markers that are gone', () => {
      const layer = makeLayer()
      layer.render([makeMarker(), makeMarker({ id: 'beta' })], null, OPEN)
      layer.render([], null, OPEN)
      expect(overlayOf(map).children).toHaveLength(0)
    })
  })

  describe('following the map', () => {
    it('re-projects the badges when the map moves', () => {
      makeLayer().render([makeMarker({ position: [1, 2] })], null, OPEN)
      map.pan(10, 5)
      map.emit('move')
      expect(badgesOf(map)[0].root.style.transform).toBe('translate3d(110px, -195px, 0)')
    })

    it('ignores a marker that has no element yet when the map moves', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], null, OPEN)
      currentMap = null
      layer.render([makeMarker(), makeMarker({ id: 'beta' })], null, OPEN)
      expect(() => map.emit('move')).not.toThrow()
      expect(badgesOf(map)).toHaveLength(1)
    })
  })

  describe('interactivity', () => {
    it('lifts the overlay above the game station markers while the panel is open', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], null, OPEN)
      layer.setInteractive(true)
      expect(overlayOf(map).style.zIndex).toBe('10')
      const { badge } = badgesOf(map)[0]
      expect(badge.style.pointerEvents).toBe('auto')
      expect(badge.style.cursor).toBe('grab')
    })

    it('drops the overlay below the game station markers while the panel is closed', () => {
      const layer = makeLayer()
      layer.setInteractive(true)
      layer.render([makeMarker()], null, OPEN)
      layer.setInteractive(false)
      expect(overlayOf(map).style.zIndex).toBe('3')
      const { badge } = badgesOf(map)[0]
      expect(badge.style.pointerEvents).toBe('none')
      expect(badge.style.cursor).toBe('default')
    })

    it('keeps the overlay passive by default so it never steals a click', () => {
      makeLayer().render([makeMarker()], null, OPEN)
      expect(overlayOf(map).style.zIndex).toBe('3')
      expect(overlayOf(map).style.pointerEvents).toBe('none')
      expect(badgesOf(map)[0].badge.style.pointerEvents).toBe('none')
    })

    it('creates a later badge already interactive when the panel is open', () => {
      const layer = makeLayer()
      layer.setInteractive(true)
      layer.render([makeMarker()], null, OPEN)
      expect(badgesOf(map)[0].badge.style.pointerEvents).toBe('auto')
      expect(overlayOf(map).style.zIndex).toBe('10')
    })

    it('tolerates being toggled before anything is drawn', () => {
      const layer = makeLayer()
      expect(() => layer.setInteractive(true)).not.toThrow()
      layer.render([makeMarker()], null, OPEN)
      expect(overlayOf(map).style.zIndex).toBe('10')
    })

    it('does no work when toggled to the value it already has', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], null, OPEN)
      overlayOf(map).style.zIndex = '99'
      layer.setInteractive(false)
      expect(overlayOf(map).style.zIndex).toBe('99')
    })
  })

  // The game can hand back a different map instance after a city load; the old
  // canvas container — and every badge in it — is gone with it.
  describe('a swapped map instance', () => {
    it('keeps one overlay across renders on the same map', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], null, OPEN)
      const first = overlayOf(map)
      layer.render([makeMarker()], null, OPEN)
      expect(overlayOf(map)).toBe(first)
      expect(map.canvasContainer.children).toHaveLength(1)
      expect(map.on).toHaveBeenCalledTimes(1)
    })

    it('rebuilds the overlay in the new map canvas container', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], null, OPEN)
      const replacement = createFakeGlMap()
      currentMap = replacement
      layer.render([makeMarker()], null, OPEN)
      expect(badgesOf(replacement)).toHaveLength(1)
      expect(badgesOf(replacement)[0].root.style.transform).toBe('translate3d(100px, -200px, 0)')
    })

    it('moves the move listener onto the new map', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], null, OPEN)
      const replacement = createFakeGlMap()
      currentMap = replacement
      layer.render([makeMarker()], null, OPEN)
      expect(map.off).toHaveBeenCalledWith('move', expect.any(Function))
      expect(map.listenerCount('move')).toBe(0)
      expect(replacement.listenerCount('move')).toBe(1)
    })

    it('stops answering the old map after the swap', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], null, OPEN)
      currentMap = createFakeGlMap()
      layer.render([makeMarker()], null, OPEN)
      map.project.mockClear()
      map.emit('move')
      expect(map.project).not.toHaveBeenCalled()
    })

    it('rebuilds the overlay when the canvas container was replaced under it', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], null, OPEN)
      const first = overlayOf(map)
      first.remove()
      layer.render([makeMarker()], null, OPEN)
      expect(overlayOf(map)).not.toBe(first)
      expect(badgesOf(map)).toHaveLength(1)
    })
  })

  describe('dragging a badge', () => {
    function renderDraggable(markers: Marker[] = [makeMarker({ position: [1, 2] })], layer = makeLayer()): {
      layer: MarkerLayer
      badge: HTMLElement
      root: HTMLElement
    } {
      layer.setInteractive(true)
      layer.render(markers, null, OPEN)
      const parts = badgesOf(map)[0]
      return { layer, badge: parts.badge, root: parts.root }
    }

    // A pointer at these client coordinates lands on map pixel (500, 300), which the
    // fake projection reads back as lng 5 / lat -3.
    const DROP_CLIENT_X = 500 + MAP_RECT_LEFT
    const DROP_CLIENT_Y = 300 + MAP_RECT_TOP

    it('reports the marker as it is dragged', () => {
      const { badge } = renderDraggable()
      pressOn(badge, { clientX: 120, clientY: 10 })
      movePointerTo(DROP_CLIENT_X, DROP_CLIENT_Y)
      flushFrames()
      expect(callbacks.onDragMove).toHaveBeenCalledWith('alpha', [5, -3])
    })

    it('moves the badge under the cursor as it is dragged', () => {
      const { badge, root } = renderDraggable()
      pressOn(badge, { clientX: 120, clientY: 10 })
      movePointerTo(DROP_CLIENT_X, DROP_CLIENT_Y)
      expect(root.style.transform).toBe('translate3d(500px, 300px, 0)')
    })

    it('reports the final position when the drag ends', () => {
      const { badge } = renderDraggable()
      pressOn(badge, { clientX: 120, clientY: 10 })
      movePointerTo(DROP_CLIENT_X, DROP_CLIENT_Y)
      flushFrames()
      releasePointer()
      expect(callbacks.onDragEnd).toHaveBeenCalledWith('alpha', [5, -3])
      expect(callbacks.onClick).not.toHaveBeenCalled()
    })

    it('coalesces the moves of one frame into a single report', () => {
      const { badge } = renderDraggable()
      pressOn(badge, { clientX: 120, clientY: 10 })
      movePointerTo(220, 110)
      movePointerTo(DROP_CLIENT_X, DROP_CLIENT_Y)
      flushFrames()
      expect(callbacks.onDragMove).toHaveBeenCalledTimes(1)
      expect(callbacks.onDragMove).toHaveBeenCalledWith('alpha', [5, -3])
    })

    it('drops the pending frame when the drag ends before it runs', () => {
      const { badge } = renderDraggable()
      pressOn(badge, { clientX: 120, clientY: 10 })
      movePointerTo(DROP_CLIENT_X, DROP_CLIENT_Y)
      releasePointer()
      expect(cancelFrame).toHaveBeenCalledTimes(1)
    })

    it('ends the drag when the pointer is cancelled', () => {
      const { badge } = renderDraggable()
      pressOn(badge, { clientX: 120, clientY: 10 })
      movePointerTo(DROP_CLIENT_X, DROP_CLIENT_Y)
      releasePointer('pointercancel')
      expect(callbacks.onDragEnd).toHaveBeenCalledWith('alpha', [5, -3])
    })

    it('stops listening once the drag is over', () => {
      const { badge } = renderDraggable()
      pressOn(badge, { clientX: 120, clientY: 10 })
      movePointerTo(DROP_CLIENT_X, DROP_CLIENT_Y)
      releasePointer()
      callbacks.onDragMove.mockClear()
      movePointerTo(300, 300)
      flushFrames()
      expect(callbacks.onDragMove).not.toHaveBeenCalled()
    })

    it('holds the dragged badge still while the map moves under it', () => {
      const { badge, root } = renderDraggable()
      pressOn(badge, { clientX: 120, clientY: 10 })
      movePointerTo(DROP_CLIENT_X, DROP_CLIENT_Y)
      map.pan(50, 50)
      map.emit('move')
      expect(root.style.transform).toBe('translate3d(500px, 300px, 0)')
    })

    it('leaves the dragged badge where the pointer is when the store re-renders', () => {
      const { layer, badge, root } = renderDraggable()
      pressOn(badge, { clientX: 120, clientY: 10 })
      movePointerTo(DROP_CLIENT_X, DROP_CLIENT_Y)
      layer.render([makeMarker({ position: [5, -3], color: '#22c55e' })], 'alpha', OPEN)
      expect(root.style.transform).toBe('translate3d(500px, 300px, 0)')
      expect(badge.style.background).toBe(asCssColor('#22c55e'))
    })

    it('follows the map again once the drag is over', () => {
      const { badge, root } = renderDraggable()
      pressOn(badge, { clientX: 120, clientY: 10 })
      movePointerTo(DROP_CLIENT_X, DROP_CLIENT_Y)
      releasePointer()
      map.emit('move')
      expect(root.style.transform).toBe('translate3d(100px, -200px, 0)')
    })
  })

  describe('a press that is not a drag', () => {
    function renderDraggable(): HTMLElement {
      const layer = makeLayer()
      layer.setInteractive(true)
      layer.render([makeMarker()], null, OPEN)
      return badgesOf(map)[0].badge
    }

    it('selects the marker when the pointer does not move', () => {
      const badge = renderDraggable()
      pressOn(badge, { clientX: 100, clientY: 100 })
      releasePointer()
      expect(callbacks.onClick).toHaveBeenCalledWith('alpha')
      expect(callbacks.onDragEnd).not.toHaveBeenCalled()
    })

    it('selects the marker when the pointer only wobbles within the threshold', () => {
      const badge = renderDraggable()
      pressOn(badge, { clientX: 100, clientY: 100 })
      movePointerTo(102, 100)
      flushFrames()
      releasePointer()
      expect(callbacks.onClick).toHaveBeenCalledWith('alpha')
      expect(callbacks.onDragEnd).not.toHaveBeenCalled()
    })

    it('treats a move past the threshold as a drag, not a click', () => {
      const badge = renderDraggable()
      pressOn(badge, { clientX: 100, clientY: 100 })
      movePointerTo(110, 100)
      flushFrames()
      releasePointer()
      expect(callbacks.onClick).not.toHaveBeenCalled()
      expect(callbacks.onDragEnd).toHaveBeenCalledTimes(1)
    })
  })

  describe('guarding the map while dragging', () => {
    function renderDraggable(): HTMLElement {
      const layer = makeLayer()
      layer.setInteractive(true)
      layer.render([makeMarker()], null, OPEN)
      return badgesOf(map)[0].badge
    }

    it('disables the map pan for the duration of the drag', () => {
      const badge = renderDraggable()
      pressOn(badge, { clientX: 100, clientY: 100 })
      expect(map.dragPan.disable).toHaveBeenCalledTimes(1)
      expect(map.dragPan.enable).not.toHaveBeenCalled()
      releasePointer()
      expect(map.dragPan.enable).toHaveBeenCalledTimes(1)
    })

    it('keeps the press from reaching the map underneath', () => {
      const badge = renderDraggable()
      const onCanvas = vi.fn()
      map.canvasContainer.addEventListener('pointerdown', onCanvas)
      const event = pressOn(badge, { clientX: 100, clientY: 100 })
      expect(event.defaultPrevented).toBe(true)
      expect(onCanvas).not.toHaveBeenCalled()
    })

    it('shows a grabbing cursor while dragging and restores it on drop', () => {
      const badge = renderDraggable()
      pressOn(badge, { clientX: 100, clientY: 100 })
      expect(badge.style.cursor).toBe('grabbing')
      releasePointer()
      expect(badge.style.cursor).toBe('grab')
    })

    it('restores the idle cursor when the panel closed mid-drag', () => {
      const layer = makeLayer()
      layer.setInteractive(true)
      layer.render([makeMarker()], null, OPEN)
      const badge = badgesOf(map)[0].badge
      pressOn(badge, { clientX: 100, clientY: 100 })
      layer.setInteractive(false)
      releasePointer()
      expect(badge.style.cursor).toBe('default')
    })

    it('ignores a press with a button other than the primary one', () => {
      const badge = renderDraggable()
      pressOn(badge, { button: 2, clientX: 100, clientY: 100 })
      releasePointer()
      expect(map.dragPan.disable).not.toHaveBeenCalled()
      expect(callbacks.onClick).not.toHaveBeenCalled()
    })

    it('ignores a press while the panel is closed', () => {
      const layer = makeLayer()
      layer.render([makeMarker()], null, OPEN)
      pressOn(badgesOf(map)[0].badge, { clientX: 100, clientY: 100 })
      releasePointer()
      expect(map.dragPan.disable).not.toHaveBeenCalled()
      expect(callbacks.onClick).not.toHaveBeenCalled()
    })

    it('captures the pointer when the browser supports it', () => {
      const prototype = HTMLElement.prototype as unknown as Record<string, unknown>
      const setPointerCapture = vi.fn()
      const releasePointerCapture = vi.fn()
      prototype.setPointerCapture = setPointerCapture
      prototype.releasePointerCapture = releasePointerCapture
      try {
        const badge = renderDraggable()
        pressOn(badge, { clientX: 100, clientY: 100, pointerId: 7 })
        expect(setPointerCapture).toHaveBeenCalledWith(7)
        releasePointer()
        expect(releasePointerCapture).toHaveBeenCalledWith(1)
      } finally {
        delete prototype.setPointerCapture
        delete prototype.releasePointerCapture
      }
    })

    // jsdom has no pointer capture at all, which is the same shape of failure as a
    // browser refusing a capture for an already-released pointer: it must not
    // abort the drag.
    it('drags on when the browser refuses to capture the pointer', () => {
      const badge = renderDraggable()
      pressOn(badge, { clientX: 100, clientY: 100 })
      movePointerTo(110, 100)
      flushFrames()
      releasePointer()
      expect(callbacks.onDragEnd).toHaveBeenCalledTimes(1)
    })
  })

  describe('the optional snap', () => {
    it('follows the snapped position rather than the raw one', () => {
      const snapPosition = vi.fn((_id: string, candidate: [number, number]): [number, number] => [
        candidate[0] + 1,
        candidate[1],
      ])
      const layer = makeLayer({ snapPosition })
      layer.setInteractive(true)
      layer.render([makeMarker()], null, OPEN)
      const { badge, root } = badgesOf(map)[0]
      pressOn(badge, { clientX: 120, clientY: 10 })
      movePointerTo(520, 310)
      flushFrames()
      releasePointer()
      expect(snapPosition).toHaveBeenCalledWith('alpha', [5, -3])
      expect(callbacks.onDragMove).toHaveBeenCalledWith('alpha', [6, -3])
      expect(callbacks.onDragEnd).toHaveBeenCalledWith('alpha', [6, -3])
      expect(root.style.transform).toBe('translate3d(600px, 300px, 0)')
    })

    it('uses the raw position when no snap is wired up', () => {
      const layer = new MarkerLayer(() => currentMap, {
        onClick: callbacks.onClick,
        onDragEnd: callbacks.onDragEnd,
        onDragMove: callbacks.onDragMove,
      })
      layer.setInteractive(true)
      layer.render([makeMarker()], null, OPEN)
      const { badge } = badgesOf(map)[0]
      pressOn(badge, { clientX: 120, clientY: 10 })
      movePointerTo(520, 310)
      flushFrames()
      expect(callbacks.onDragMove).toHaveBeenCalledWith('alpha', [5, -3])
    })
  })
})
