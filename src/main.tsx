import { MarkerStore } from '@/application/MarkerStore'
import { SettingsStore } from '@/application/SettingsStore'
import { RoadNamer } from '@/infrastructure/game/RoadNamer'
import { StationNamer } from '@/infrastructure/game/StationNamer'
import { MapMarkersController } from '@/infrastructure/map/MapMarkersController'
import { MarkerRepository } from '@/infrastructure/persistence/MarkerRepository'
import { createModStorage } from '@/infrastructure/persistence/ModStorage'
import { SettingsRepository } from '@/infrastructure/persistence/SettingsRepository'
import { SaveScopeRegistrar } from '@/infrastructure/save/SaveScopeRegistrar'
import { GameSession } from '@/infrastructure/store/GameSession'
import { FloatingPanelRegistrar } from '@/infrastructure/ui/FloatingPanelRegistrar'
import { clampStoredPanelGeometry } from '@/infrastructure/ui/PanelViewport'
import { createMarkersPanel } from '@/presentation/MarkersPanel'
import { logger } from '@/shared/Logger'

// Composition root. The mod needs the public API for the map (utils.getMap), the
// panel (ui.addFloatingPanel) and the save/load hooks, plus storage to persist
// markers scoped to the current save. The internal store is read only for the loaded
// save's id and the city code (to scope markers) — both optional, so a missing handle
// just degrades the scoping.
function bootstrap(): void {
  const api = window.SubwayBuilderAPI
  if (!api) {
    logger.error('SubwayBuilderAPI not found!')

    return
  }

  const storeCallbacks = window.__subwayBuilder_storeCallbacks__ ?? null
  const session = new GameSession(api, storeCallbacks)
  const repository = new MarkerRepository(createModStorage())
  const store = new MarkerStore(repository, session)
  const settings = new SettingsStore(new SettingsRepository())
  const controller = new MapMarkersController(api, store, settings, new RoadNamer(storeCallbacks))
  const stationNamer = new StationNamer(storeCallbacks, store, settings)

  // Pre-clamp any stale saved window position so the panel opens on-screen (and the
  // game's own position state stays consistent); re-checked on each lifecycle hook,
  // e.g. after the game window is resized.
  clampStoredPanelGeometry()

  const panel = createMarkersPanel({ api, controller, settings, store })
  const registrar = new FloatingPanelRegistrar(api, panel, () => {
    clampStoredPanelGeometry()
    controller.syncToMap()
  })
  const saveScope = new SaveScopeRegistrar(api, store, () => controller.syncToMap())
  registrar.register()
  registrar.installLifecycleHooks()
  controller.start()
  saveScope.install()
  saveScope.syncNow()
  stationNamer.install(api)
  logger.log('mod loaded.')
}

bootstrap()
