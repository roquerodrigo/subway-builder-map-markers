// A folder that groups markers together — e.g. all the stations of one subway line —
// so the board can be organized and a whole line hidden at once. Pure data: no map or
// DOM. `color` is optional (null when unset), gives the folder's line its color and is
// what a marker created in the folder starts out as. `hidden` drives whether the
// folder's markers draw on the map. Which folder the panel has open is the panel's own
// state, not the board's — it isn't persisted.
//
// The folder holds its markers, in the order the line runs through them (`markerIds`),
// rather than each marker naming one folder: an interchange belongs to every line that
// stops there, and each of those lines reaches it at a different point in its own
// sequence. A marker id may therefore appear in several folders, and an id here that
// matches no marker is simply skipped.
export interface MarkerGroup {
  color: null | string
  hidden: boolean
  id: string
  markerIds: string[]
  name: string
}
