// A folder that groups markers together — e.g. all the stations of one subway line —
// so the board can be organized and a whole line hidden at once. Pure data: no map or
// DOM. Markers point at a group by id (`Marker.groupId`); the group carries only its
// own display state. `color` is optional (null when unset) and lets a folder echo its
// line color in the panel. `hidden` drives whether the group's markers draw on the map.
// `collapsed` is the panel's own open/closed state, persisted so a folder stays folded
// across sessions.
export interface MarkerGroup {
  collapsed: boolean
  color: null | string
  hidden: boolean
  id: string
  name: string
}
