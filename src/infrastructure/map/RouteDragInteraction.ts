import type { Marker } from '@/domain/marker/Marker'
import type { MarkerRoute } from '@/domain/route/MarkerRoute'
import type { Coordinate } from '@/shared/game/Coordinate'
import type { GlMap, MapMouseEvent } from '@/shared/game/GlMap'

import { routeUnderPoint } from '@/domain/route/RouteHitTest'

const SOURCE_ID = 'sbmm-route-drag'
const LAYER_ID = 'sbmm-route-drag-line'
// How close the pointer has to be, in screen pixels, to grab a line or to drop it on a
// marker. Both are generous: a line is 4 px wide and a badge 32 px across, and this is
// a sketching tool, not surgery.
const GRAB_TOLERANCE_PX = 12
const DROP_TOLERANCE_PX = 24

export interface RouteDragCallbacks {
  // What the map is showing, read at the moment the drag starts.
  markers(): Marker[]
  // The pointer let go over a marker that isn't on that line yet.
  onAttach(markerId: string, groupId: string): void
  routes(): MarkerRoute[]
}

// Lets a folder's line be dragged onto a marker to add that marker to the folder: press
// on the line, pull a rubber band to a marker, let go. Letting go anywhere else drops
// the band and leaves the line exactly as it was — nothing is changed until a marker
// takes it.
//
// It works in screen pixels, because that is what the player is aiming with: the line
// is 4 px wide whatever the zoom. The pointer is followed on the window rather than on
// the map, since the badges are DOM elements that swallow the map's own events.
export class RouteDragInteraction {
  private attachedMap: GlMap | null = null
  private dragging: null | { color: string, from: Coordinate, groupId: string } = null
  private enabled = false

  constructor(
    private readonly getMap: () => GlMap | null,
    private readonly callbacks: RouteDragCallbacks,
  ) {}

  // Follows the panel: with it closed the overlay is a passive sketch and must not
  // grab the pointer.
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return
    }
    this.enabled = enabled
    if (enabled) {
      this.attach()
    } else {
      this.detach()
    }
  }

  // Re-bind after a city load handed the game a new map instance.
  syncToMap(): void {
    if (this.enabled) {
      this.attach()
    }
  }

  private attach(): void {
    const map = this.getMap()
    if (!map || map === this.attachedMap) {
      return
    }
    this.detach()
    map.on('mousedown', this.onPointerDown)
    this.attachedMap = map
  }

  private clearBand(map: GlMap): void {
    const source = map.getSource(SOURCE_ID)
    source?.setData({ features: [], type: 'FeatureCollection' })
  }

  private detach(): void {
    this.attachedMap?.off('mousedown', this.onPointerDown)
    this.attachedMap = null
  }

  // The marker under the pointer that this line doesn't already stop at.
  private markerUnder(map: GlMap, at: Coordinate, groupId: string): Marker | null {
    const route = this.callbacks.routes().find((candidate) => candidate.groupId === groupId)
    const held = new Set((route?.points ?? []).map((point) => `${point[0]},${point[1]}`))
    const pointer = map.project(at)
    let best: Marker | null = null
    let bestDistance = DROP_TOLERANCE_PX
    for (const marker of this.callbacks.markers()) {
      if (held.has(`${marker.position[0]},${marker.position[1]}`)) {
        continue
      }
      const point = map.project(marker.position)
      const distance = Math.hypot(point.x - pointer.x, point.y - pointer.y)
      if (distance <= bestDistance) {
        best = marker
        bestDistance = distance
      }
    }

    return best
  }

  private onPointerDown = (event: MapMouseEvent): void => {
    const map = this.getMap()
    if (!map || this.dragging) {
      return
    }
    const at: Coordinate = [event.lngLat.lng, event.lngLat.lat]
    const hit = routeUnderPoint(this.callbacks.routes(), at, this.toleranceAt(map, at, GRAB_TOLERANCE_PX))
    if (!hit) {
      return
    }
    const route = this.callbacks.routes().find((candidate) => candidate.groupId === hit.groupId)
    this.dragging = { color: route?.color ?? '#3b82f6', from: at, groupId: hit.groupId }
    map.dragPan?.disable()
    this.setCursor(map, 'copy')
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
  }

  private onPointerMove = (event: PointerEvent): void => {
    const map = this.getMap()
    if (!map || !this.dragging) {
      return
    }
    this.showBand(map, this.dragging.from, this.pointerPosition(map, event), this.dragging.color)
  }

  private onPointerUp = (event: PointerEvent): void => {
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    const dragging = this.dragging
    const map = this.getMap()
    this.dragging = null
    if (!map) {
      return
    }
    map.dragPan?.enable()
    this.setCursor(map, '')
    this.clearBand(map)
    if (!dragging) {
      return
    }
    const marker = this.markerUnder(map, this.pointerPosition(map, event), dragging.groupId)
    if (marker) {
      this.callbacks.onAttach(marker.id, dragging.groupId)
    }
  }

  private pointerPosition(map: GlMap, event: PointerEvent): Coordinate {
    const rect = map.getContainer().getBoundingClientRect()
    const lngLat = map.unproject([event.clientX - rect.left, event.clientY - rect.top])

    return [lngLat.lng, lngLat.lat]
  }

  private setCursor(map: GlMap, cursor: string): void {
    try {
      map.getCanvasContainer().style.cursor = cursor
    } catch {
      /* cursor hint is best-effort */
    }
  }

  // The rubber band: where the line was grabbed, to wherever the pointer is now.
  private showBand(map: GlMap, from: Coordinate, to: Coordinate, color: string): void {
    const data = {
      features: [{
        geometry: { coordinates: [from, to], type: 'LineString' },
        properties: { color },
        type: 'Feature',
      }],
      type: 'FeatureCollection',
    }
    const source = map.getSource(SOURCE_ID)
    if (source) {
      source.setData(data)
    } else {
      try {
        map.addSource(SOURCE_ID, { data, type: 'geojson' })
      } catch {
        return // the style isn't ready; the drag still works, just without the band
      }
    }
    if (!map.getLayer(LAYER_ID)) {
      map.addLayer({
        id: LAYER_ID,
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-dasharray': [1, 1],
          'line-opacity': 0.9,
          'line-width': 3,
        },
        source: SOURCE_ID,
        type: 'line',
      })
    }
  }

  // `within` pixels, in the degrees the hit test measures — the map's scale changes
  // with the zoom, so it has to be asked every time.
  private toleranceAt(map: GlMap, at: Coordinate, pixels: number): number {
    const point = map.project(at)
    const offset = map.unproject([point.x + pixels, point.y])

    return Math.abs(offset.lng - at[0]) * Math.cos((at[1] * Math.PI) / 180)
  }
}
