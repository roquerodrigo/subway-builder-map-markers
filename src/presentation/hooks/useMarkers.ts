import type { MarkerStore } from '@/application/MarkerStore'
import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'
import type { MapMarkersController } from '@/infrastructure/map/MapMarkersController'

import { React } from '@/infrastructure/ui/react'

export interface MarkersSnapshot {
  groups: MarkerGroup[]
  markers: Marker[]
  selectedId: null | string
}

// Subscribe the panel to the shared MarkerStore so a drag on the map (which also
// writes to the store) keeps the list in sync, and vice-versa. The snapshot carries
// the folders too, so a group edit re-renders the list alongside a marker edit.
export function useMarkers(store: MarkerStore): MarkersSnapshot {
  const [snapshot, setSnapshot] = React.useState<MarkersSnapshot>(() => ({
    groups: store.groups(),
    markers: store.all(),
    selectedId: store.selected(),
  }))
  React.useEffect(() => {
    const update = (): void =>
      setSnapshot({ groups: store.groups(), markers: store.all(), selectedId: store.selected() })
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
