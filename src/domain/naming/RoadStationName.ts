import type { Coordinate } from '@/shared/game/Coordinate'

// How the game names a station it builds, reproduced so a marker dropped on the map
// arrives with the same name the station there would get. The rules are the game's own
// (renderer bundle, `getStationName`/`formatRoadName`): the radii it widens the search
// through, the cross-street preference, the suffix abbreviations and the suffixes that
// can't stand alone as a name.
export const ROAD_SEARCH_RADII = [0.001, 0.002, 0.005, 0.01]
// A road crossing the line at 45° or more is a cross street, and a station is named
// after the street it crosses far more often than the one it runs along.
const CROSS_STREET_ANGLE = 45
const CROSS_STREET_BONUS = 1000
const DEGREES_PER_ANGLE = 10
const METERS_PER_DEGREE_LATITUDE = 111320
const RADIANS = Math.PI / 180

const ABBREVIATIONS: Record<string, string> = {
  avenue: 'Av',
  boulevard: 'Blvd',
  drive: 'Dr',
  e: '',
  east: '',
  extension: '',
  heights: 'Hts',
  highway: 'Hwy',
  lane: 'Ln',
  n: '',
  ne: '',
  north: '',
  northeast: '',
  northwest: '',
  nw: '',
  parkway: 'Pkwy',
  place: 'Pl',
  road: 'Rd',
  s: '',
  se: '',
  south: '',
  southeast: '',
  southwest: '',
  square: 'Sq',
  st: '',
  street: 'St',
  sw: '',
  tunnel: '',
  w: '',
  west: '',
}
// A name that is nothing but a suffix names nothing.
const BANNED = new Set(['Av', 'Blvd', 'Dr', 'Hts', 'Hwy', 'Ln', 'Pkwy', 'Pl', 'Rd', 'Sq', 'St'])
// Kept when it opens a two-word name ("West Side"), dropped anywhere else.
const DIRECTIONS = new Set([
  'e', 'east', 'n', 'ne', 'north', 'northeast', 'northwest', 'nw',
  's', 'se', 'south', 'southeast', 'southwest', 'sw', 'w', 'west',
])

// A road the search turned up: its name and the shape it runs in.
export interface RoadSegment {
  coordinates: Coordinate[]
  name: string
}

// "42nd Street Extension" → "42 St". Ordinals lose their suffix, each word is
// abbreviated (or dropped), and a leading direction survives only in a two-word name.
export function formatRoadName(name: string): string {
  const words = name.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1').split(/\s+/)

  return words
    .map((word, index) => {
      if (index === 0 && words.length === 2 && DIRECTIONS.has(word.toLowerCase())) {
        return word
      }

      return ABBREVIATIONS[word.toLowerCase()] ?? word
    })
    .filter((word) => word !== '')
    .join(' ')
    .trim()
    .replace(/\s+/g, ' ')
}

// Name a station at `at` after the roads around it. `alongBearing` is the direction the
// line runs there (a folder's platform), which is what makes a cross street win; pass
// null where there is no line yet and the nearest named road wins instead.
//
// `search` is asked for the roads inside each radius in turn, widening only when the
// last one turned up nothing usable — the game's own escalation, and the reason a
// station in an empty stretch still finds a name.
export function stationNameFromRoads(
  at: Coordinate,
  alongBearing: null | number,
  search: (radius: number) => RoadSegment[],
): null | string {
  for (const radius of ROAD_SEARCH_RADII) {
    const scored = search(radius)
      .filter((road) => road.name && road.coordinates.length >= 2)
      .map((road) => ({ name: formatRoadName(road.name), score: scoreOf(at, alongBearing, road) }))
      .filter((candidate) => candidate.name.length > 0 && !BANNED.has(candidate.name))
      .sort((one, other) => other.score - one.score)
    if (scored.length > 0) {
      return scored[0].name
    }
  }

  return null
}

// The smaller angle between two bearings, and between a bearing and its reverse: a
// road running north-south crosses one running east-west whichever way each is drawn.
function angleBetween(one: number, other: number): number {
  const difference = Math.abs(((one - other + 360) % 360) - 180)

  return Math.min(difference, 180 - difference)
}

// The compass bearing of a line, 0–360, as the game measures it: first point to last.
function bearingOf(coordinates: Coordinate[]): number {
  const [fromLng, fromLat] = coordinates[0]
  const [toLng, toLat] = coordinates[coordinates.length - 1]
  const from = fromLat * RADIANS
  const to = toLat * RADIANS
  const deltaLng = (toLng - fromLng) * RADIANS
  const y = Math.sin(deltaLng) * Math.cos(to)
  const x = Math.cos(from) * Math.sin(to) - Math.sin(from) * Math.cos(to) * Math.cos(deltaLng)
  const bearing = Math.atan2(y, x) / RADIANS

  return bearing < 0 ? bearing + 360 : bearing
}

function distanceToSegment(point: Coordinate, from: Coordinate, to: Coordinate): number {
  const alongX = to[0] - from[0]
  const alongY = to[1] - from[1]
  const lengthSquared = alongX * alongX + alongY * alongY
  if (lengthSquared === 0) {
    return Math.hypot(point[0] - from[0], point[1] - from[1])
  }
  const at = Math.min(1, Math.max(0, ((point[0] - from[0]) * alongX + (point[1] - from[1]) * alongY) / lengthSquared))

  return Math.hypot(point[0] - (from[0] + at * alongX), point[1] - (from[1] + at * alongY))
}

function metersToSegment(at: Coordinate, coordinates: Coordinate[]): number {
  const scale = Math.cos(at[1] * RADIANS)
  const point: Coordinate = [at[0] * scale, at[1]]
  let closest = Infinity
  for (let index = 1; index < coordinates.length; index++) {
    const from: Coordinate = [coordinates[index - 1][0] * scale, coordinates[index - 1][1]]
    const to: Coordinate = [coordinates[index][0] * scale, coordinates[index][1]]
    closest = Math.min(closest, distanceToSegment(point, from, to))
  }

  return closest * METERS_PER_DEGREE_LATITUDE
}

// Nearest wins, but a cross street beats every road the line merely runs along —
// scored the way the game scores it, in metres against degrees.
function scoreOf(at: Coordinate, alongBearing: null | number, road: RoadSegment): number {
  const meters = metersToSegment(at, road.coordinates)
  if (alongBearing === null) {
    return -meters
  }
  const angle = angleBetween(alongBearing, bearingOf(road.coordinates))

  return (angle >= CROSS_STREET_ANGLE ? CROSS_STREET_BONUS : 0) + angle * DEGREES_PER_ANGLE - meters
}
