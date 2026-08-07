// A folder that groups markers together — e.g. all the stations of one subway line —
// so the board can be organized and a whole line hidden at once. Pure data: no map or
// DOM. `color` is optional (null when unset) and lets a folder echo its line color in
// the panel. `hidden` drives whether the folder's markers draw on the map. `collapsed`
// is the panel's own open/closed state, persisted so a folder stays folded across
// sessions.
//
// The folder holds its markers, in the order the line runs through them (`markerIds`),
// rather than each marker naming one folder: an interchange belongs to every line that
// stops there, and each of those lines reaches it at a different point in its own
// sequence. A marker id may therefore appear in several folders, and an id here that
// matches no marker is simply skipped.
export interface MarkerGroup {
  collapsed: boolean
  color: null | string
  hidden: boolean
  id: string
  markerIds: string[]
  name: string
}
