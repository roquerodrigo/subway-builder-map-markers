import type { MarkerStore } from '../application/MarkerStore'
import type { SettingsStore } from '../application/SettingsStore'
import type { MapMarkersController } from '../infrastructure/map/MapMarkersController'
import type { SubwayBuilderApi } from '../shared/game/SubwayBuilderApi'

// Everything the panel needs, injected by the composition root (main.tsx) so the
// presentation layer never reaches into window/map/store directly. Marker reads
// and edits go through the store; global display settings through the settings
// store; map-side actions (placement, focus) through the controller.
export interface PanelDependencies {
  api: SubwayBuilderApi
  controller: MapMarkersController
  settings: SettingsStore
  store: MarkerStore
}
