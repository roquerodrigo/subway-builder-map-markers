// The slice of the Mapbox/MapLibre GL map instance (api.utils.getMap()) this mod
// uses. Only the members actually called are typed; the live instance has many
// more. Both GL libraries share these method names/shapes.

// dragPan is the built-in pan handler; disabling it during a marker drag stops the
// map from panning under the pointer, then it's re-enabled on drop.
export interface DragPan { disable(): void, enable(): void }
export interface GlMap {
  addLayer(layer: unknown, beforeId?: string): void
  addSource(id: string, source: unknown): void
  dragPan?: DragPan
  easeTo(options: { center: LngLatLike, duration?: number, zoom?: number }): void
  getCanvasContainer(): HTMLElement
  getCenter(): LngLat
  getContainer(): HTMLElement
  getLayer(id: string): unknown
  getSource(id: string): undefined | { setData(data: unknown): void }
  getZoom(): number
  isStyleLoaded(): boolean
  off(type: string, listener: (event: MapMouseEvent) => void): void
  on(type: string, listener: (event: MapMouseEvent) => void): void
  once(type: string, listener: (event: MapMouseEvent) => void): void
  project(lngLat: LngLatLike): Point
  setFilter(layerId: string, filter: unknown): void
  setPaintProperty(layerId: string, name: string, value: unknown): void
  unproject(point: [number, number]): LngLat
}
export interface LngLat { lat: number, lng: number }

export type LngLatLike = [number, number] | LngLat

// Fired by 'click'/'contextmenu' — carries the geographic point that was clicked.
export interface MapMouseEvent { lngLat: LngLat }

export interface Point { x: number, y: number }
