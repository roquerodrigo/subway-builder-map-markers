import { DEFAULT_MARKER_COLOR } from '@/domain/marker/MarkerPalette'

// Where two lines meet, neither line's color is right — so an interchange is black,
// the way transit maps have always drawn them. The route outline keeps it readable on
// a dark map.
export const INTERCHANGE_COLOR = '#000000'

// A marker's color follows the folders it is on: the folder's own color on one line,
// black on two or more. A color that came from somewhere else is a choice the player
// made and is kept — `derivedColors` is what "somewhere else" is measured against (the
// colors of the board's folders, plus the two the mod assigns itself).
export function colorForMembership(current: string, holders: (null | string)[], derivedColors: Set<string>): string {
  const next = holders.length >= 2 ? INTERCHANGE_COLOR : (holders.length === 1 ? holders[0] : null)
  if (next === null || next === current) {
    return current
  }
  const wasDerived = current === DEFAULT_MARKER_COLOR || current === INTERCHANGE_COLOR || derivedColors.has(current)

  return wasDerived ? next : current
}
