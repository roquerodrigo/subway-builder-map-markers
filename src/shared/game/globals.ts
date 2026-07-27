import type { ElectronBridge } from '@/shared/game/ElectronBridge'
import type { StoreCallbacks } from '@/shared/game/StoreCallbacks'
import type { SubwayBuilderApi } from '@/shared/game/SubwayBuilderApi'

declare global {
  interface Window {
    __subwayBuilder_storeCallbacks__?: StoreCallbacks
    electron?: ElectronBridge
    SubwayBuilderAPI?: SubwayBuilderApi
  }
}

export {}
