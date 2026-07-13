import type { StoreCallbacks } from './StoreCallbacks'
import type { SubwayBuilderApi } from './SubwayBuilderApi'

declare global {
  interface Window {
    __subwayBuilder_storeCallbacks__?: StoreCallbacks
    SubwayBuilderAPI?: SubwayBuilderApi
  }
}

export {}
