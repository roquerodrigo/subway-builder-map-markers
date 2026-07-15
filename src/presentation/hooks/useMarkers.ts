import type { MarkerStore } from '@/application/MarkerStore'
import type { Marker } from '@/domain/marker/Marker'
import type { MapMarkersController } from '@/infrastructure/map/MapMarkersController'

import { React } from '@/infrastructure/ui/react'

export interface MarkersSnapshot {
  markers: Marker[]
  selectedId: null | string
}

// Subscribe the panel to the shared MarkerStore so a drag on the map (which also
// writes to the store) keeps the list in sync, and vice-versa.
export function useMarkers(store: MarkerStore): MarkersSnapshot {
  const [snapshot, setSnapshot] = React.useState<MarkersSnapshot>(() => ({
    markers: store.all(),
    selectedId: store.selected(),
  }))
  React.useEffect(() => {
    const update = (): void => setSnapshot({ markers: store.all(), selectedId: store.selected() })
    update()

    return store.subscribe(update)
  }, [store])

  return snapshot
}

// Track the controller's placement mode so the "add marker" button can reflect it
// (and reset when the map places the marker).
export function usePlacement(controller: MapMarkersController): boolean {
  const [placing, setPlacing] = React.useState<boolean>(() => controller.isPlacing())
  React.useEffect(() => {
    setPlacing(controller.isPlacing())

    return controller.onPlacementChange(setPlacing)
  }, [controller])

  return placing
}
