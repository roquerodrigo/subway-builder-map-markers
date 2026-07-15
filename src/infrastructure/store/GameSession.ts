import type { StoreCallbacks } from '@/shared/game/StoreCallbacks'
import type { SubwayBuilderApi } from '@/shared/game/SubwayBuilderApi'

// What the mod knows about the active game: which save is loaded and which city.
// The save id (the loaded save file) scopes markers per save; the city code scopes
// the continuity cache. cityCode prefers the public api.utils.getCityCode() and
// falls back to the internal store; saveId comes only from the internal store
// (currentSaveInfo.id), which the public API doesn't expose. Both are optional — a
// missing handle just degrades the scoping, never throws.
export class GameSession {
  constructor(
    private readonly api: SubwayBuilderApi,
    private readonly storeCallbacks: null | StoreCallbacks,
  ) {}

  cityCode(): null | string {
    const fromApi = this.api.utils?.getCityCode?.()
    const code = fromApi && fromApi.length > 0 ? fromApi : this.readStore((state) => state.cityCode)
    return code && code.length > 0 ? code : null
  }

  saveId(): null | string {
    const id = this.readStore((state) => state.currentSaveInfo?.id)
    return id && id.length > 0 ? id : null
  }

  private readStore(pick: (state: ReturnType<StoreCallbacks['getState']>) => string | undefined): null | string {
    try {
      return pick(this.storeCallbacks?.getState() ?? {}) ?? null
    } catch {
      return null
    }
  }
}
