import type { StoreCallbacks } from '@/shared/game/StoreCallbacks'
import type { SubwayBuilderApi } from '@/shared/game/SubwayBuilderApi'

declare global {
  interface Window {
    __subwayBuilder_storeCallbacks__?: StoreCallbacks
    SubwayBuilderAPI?: SubwayBuilderApi
  }
}

export {}
