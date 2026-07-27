// The preload bridge the game exposes to the renderer. Only `invoke` is used here, to
// reach the main process's per-mod storage channels.
export interface ElectronBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}
