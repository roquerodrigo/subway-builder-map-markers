import type { Marker } from '../../domain/marker/Marker'
import type { Coordinate } from '../../shared/game/Coordinate'
import type { GlMap } from '../../shared/game/GlMap'

import { markerIcon } from '../../domain/marker/MarkerIconSet'
import { iconSvgMarkup } from './iconMarkup'

const CONTAINER_CLASS = 'sbmm-marker-overlay'
const BADGE_SIZE = 32
const DRAG_THRESHOLD_PX = 3
// z-index while interactive: above the game's own station markers (native
// maplibregl-markers at z-index 5), so a badge over a station can be grabbed.
const Z_INTERACTIVE = '10'
// z-index while idle (panel closed): below the game markers, so the badges are a
// pure visual overlay that doesn't sit over — or steal clicks from — the map.
const Z_IDLE = '3'

export interface MarkerLayerCallbacks {
  onClick(id: string): void
  onDragEnd(id: string, position: Coordinate): void
  onDragMove(id: string, position: Coordinate): void
  // Optional magnetic snap: given the raw dragged position, return where the marker
  // should actually sit (e.g. pulled onto the ideal spacing from its neighbors).
  snapPosition?(id: string, candidate: Coordinate): Coordinate
}

// How the overlay should look on this draw. The layer knows nothing about why —
// the controller resolves the opacity from the panel state + settings.
export interface MarkerLayerView {
  opacity: number
  showLabels: boolean
}

interface MarkerElement {
  root: HTMLDivElement
  badge: HTMLDivElement
  label: HTMLDivElement
  markerId: string
}

// Renders each marker as a draggable DOM badge on the map's canvas container —
// the same technique the GL libraries' own Marker uses (a positioned element,
// re-projected on every map move). Kept off the React tree because it lives on the
// map canvas, not in the panel; it talks to the rest of the app only through the
// injected callbacks (which drive the shared MarkerStore). Handles its own drag:
// while the pointer is down the map's pan is disabled and the badge follows the
// cursor; a press that doesn't move is treated as a click (selection).
//
// Interactivity is gated on the panel being open (setInteractive): while it's
// closed the badges are a passive overlay — lowered below the game markers and
// pointer-events:none — so they never intercept clicks or get dragged by accident
// while the player is editing the map.
export class MarkerLayer {
  private attachedMap: GlMap | null = null
  private container: HTMLElement | null = null
  private draggingId: null | string = null
  private elements = new Map<string, MarkerElement>()
  private interactive = false
  private markers: Marker[] = []
  private opacity = 1
  private selectedId: null | string = null
  private showLabels = true
  constructor(
    private readonly getMap: () => GlMap | null,
    private readonly callbacks: MarkerLayerCallbacks,
  ) {}

  render(markers: Marker[], selectedId: null | string, view: MarkerLayerView): void {
    this.markers = markers
    this.selectedId = selectedId
    this.showLabels = view.showLabels
    this.opacity = view.opacity
    const map = this.getMap()
    if (!map) {
      return
    }
    this.attach(map)
    this.applyOpacity()
    this.reconcile()
  }

  // Toggle whether the badges can be dragged/clicked. Driven by the panel's
  // mount/unmount so markers only respond while the panel is open.
  setInteractive(interactive: boolean): void {
    if (this.interactive === interactive) {
      return
    }
    this.interactive = interactive
    this.applyInteractivity()
  }

  private applyInteractivity(): void {
    if (this.container) {
      this.container.style.zIndex = this.interactive ? Z_INTERACTIVE : Z_IDLE
    }
    for (const element of this.elements.values()) {
      element.badge.style.pointerEvents = this.interactive ? 'auto' : 'none'
      element.badge.style.cursor = this.interactive ? 'grab' : 'default'
    }
  }

  private applyOpacity(): void {
    if (this.container) {
      this.container.style.opacity = String(this.opacity)
    }
  }

  // (Re)bind to the current map. The game can swap the map instance on city load;
  // when it does, the old canvas container (and our badges) are gone, so rebuild
  // the overlay in the new one and move the 'move' listener across.
  private attach(map: GlMap): void {
    if (this.attachedMap === map && this.container?.isConnected) {
      return
    }
    if (this.attachedMap) {
      this.attachedMap.off('move', this.reposition)
    }
    this.elements.clear()
    const container = document.createElement('div')
    container.className = CONTAINER_CLASS
    Object.assign(container.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      pointerEvents: 'none',
      // Raised above the game's station markers only while interactive (see
      // setInteractive). The container is pointer-events:none, so only the badges
      // themselves intercept — the rest of each station stays clickable.
      zIndex: this.interactive ? Z_INTERACTIVE : Z_IDLE,
      // Fading the whole overlay in one place covers badges and labels alike, and
      // costs nothing per marker.
      opacity: String(this.opacity),
      transition: 'opacity 160ms ease',
    })
    map.getCanvasContainer().appendChild(container)
    this.container = container
    this.attachedMap = map
    map.on('move', this.reposition)
  }

  private beginDrag(event: PointerEvent, element: MarkerElement): void {
    const map = this.attachedMap
    if (!map || !this.interactive || event.button !== 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation() // don't let the map start a pan
    const id = element.markerId
    const startX = event.clientX
    const startY = event.clientY
    const rect = map.getContainer().getBoundingClientRect()
    let moved = false
    let latest: Coordinate | null = null
    let frame: null | number = null

    this.draggingId = id
    map.dragPan?.disable()
    element.badge.style.cursor = 'grabbing'
    try {
      element.badge.setPointerCapture(event.pointerId)
    } catch {
      /* capture is best-effort */
    }

    const commit = (): void => {
      frame = null
      if (latest) {
        this.callbacks.onDragMove(id, latest)
      }
    }

    const onMove = (moveEvent: PointerEvent): void => {
      if (!moved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > DRAG_THRESHOLD_PX) {
        moved = true
      }
      const x = moveEvent.clientX - rect.left
      const y = moveEvent.clientY - rect.top
      const lngLat = map.unproject([x, y])
      const raw: Coordinate = [lngLat.lng, lngLat.lat]
      // Snap onto the ideal spacing when near a neighbor's ring; the badge follows
      // the snapped position so the magnet is visible, and that's what we report.
      const position = this.callbacks.snapPosition?.(id, raw) ?? raw
      const point = map.project(position)
      element.root.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`
      latest = position
      if (frame === null) {
        frame = requestAnimationFrame(commit)
      }
    }

    const onUp = (upEvent: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
      map.dragPan?.enable()
      element.badge.style.cursor = this.interactive ? 'grab' : 'default'
      this.draggingId = null
      try {
        element.badge.releasePointerCapture(upEvent.pointerId)
      } catch {
        /* capture may already be gone */
      }
      if (!moved) {
        this.callbacks.onClick(id)
      } else if (latest) {
        this.callbacks.onDragEnd(id, latest)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  private createElement(marker: Marker): MarkerElement {
    const root = document.createElement('div')
    Object.assign(root.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      willChange: 'transform',
      pointerEvents: 'none',
    })

    const badge = document.createElement('div')
    Object.assign(badge.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      transform: 'translate(-50%, -50%)',
      width: `${BADGE_SIZE}px`,
      height: `${BADGE_SIZE}px`,
      borderRadius: '50%',
      border: '2px solid #ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: this.interactive ? 'grab' : 'default',
      pointerEvents: this.interactive ? 'auto' : 'none',
      touchAction: 'none',
      boxSizing: 'border-box',
      transition: 'box-shadow 120ms ease, transform 120ms ease',
    })

    const label = document.createElement('div')
    Object.assign(label.style, {
      position: 'absolute',
      left: '0',
      top: `${BADGE_SIZE / 2 + 4}px`,
      transform: 'translate(-50%, 0)',
      padding: '1px 6px',
      borderRadius: '6px',
      background: 'rgba(15, 17, 21, 0.85)',
      color: '#ffffff',
      font: '600 11px/1.4 system-ui, sans-serif',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
    })

    root.appendChild(badge)
    root.appendChild(label)

    const element: MarkerElement = { root, badge, label, markerId: marker.id }
    badge.addEventListener('pointerdown', (event) => this.beginDrag(event, element))
    return element
  }

  private positionElement(element: MarkerElement, position: Coordinate): void {
    const map = this.attachedMap
    if (!map) {
      return
    }
    const point = map.project(position)
    element.root.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`
  }

  private reconcile(): void {
    if (!this.container) {
      return
    }
    const seen = new Set<string>()
    for (const marker of this.markers) {
      seen.add(marker.id)
      let element = this.elements.get(marker.id)
      if (!element) {
        element = this.createElement(marker)
        this.elements.set(marker.id, element)
        this.container.appendChild(element.root)
      }
      this.updateElement(element, marker)
      if (this.draggingId !== marker.id) {
        this.positionElement(element, marker.position)
      }
    }
    for (const [id, element] of this.elements) {
      if (!seen.has(id)) {
        element.root.remove()
        this.elements.delete(id)
      }
    }
  }

  private reposition = (): void => this.repositionAll()

  private repositionAll(): void {
    for (const marker of this.markers) {
      if (this.draggingId === marker.id) {
        continue
      }
      const element = this.elements.get(marker.id)
      if (element) {
        this.positionElement(element, marker.position)
      }
    }
  }

  private updateElement(element: MarkerElement, marker: Marker): void {
    const selected = marker.id === this.selectedId
    element.badge.style.background = marker.color
    element.badge.style.transform = selected ? 'translate(-50%, -50%) scale(1.14)' : 'translate(-50%, -50%)'
    element.badge.style.boxShadow = selected ?
      `0 2px 6px rgba(0,0,0,0.5), 0 0 0 3px #ffffff, 0 0 0 6px ${marker.color}66` :
      '0 2px 5px rgba(0,0,0,0.45)'
    element.badge.style.zIndex = selected ? '2' : '1'
    element.badge.innerHTML = iconSvgMarkup(markerIcon(marker.icon), '#ffffff', 18)
    const text = marker.label.trim()
    element.label.textContent = text
    element.label.style.display = this.showLabels && text ? 'block' : 'none'
  }
}
