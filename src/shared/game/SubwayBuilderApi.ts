export interface FloatingPanelConfig {
  defaultHeight?: number
  defaultWidth?: number
  icon: string
  id: string
  minHeight?: number
  minWidth?: number
  render: (props: { height?: number, width?: number }) => unknown
  title: string
  tooltip: string
}

// The public modding API (window.SubwayBuilderAPI). Only the namespaces/members
// this mod actually uses are typed; all are optional and feature-detected. The
// map work goes through utils.getMap() (a Mapbox/MapLibre GL instance, typed as
// GlMap at the call sites), the panel through ui.addFloatingPanel, and the
// save/load hooks (which pass a save name) drive per-save marker scoping.
export interface SubwayBuilderApi {
  hooks?: Record<string, ((callback: (arg?: string) => void) => void) | undefined>
  ui?: {
    addFloatingPanel?(config: FloatingPanelConfig): void
    showNotification?(message: string, kind?: string): void
    unregisterComponent?(location: string, id: string): void
  }
  utils?: { getCityCode?(): string, getMap?(): unknown, React?: typeof import('react') }
}
