// Global display settings for the markers overlay (not per-marker): the influence
// radius, how visible the overlay is while the panel is closed, and the show/hide
// toggles the config tab edits. Pure data.
export interface MarkerSettings {
  idleOpacity: number
  // When on, a station the player builds inside a marker's influence area is renamed
  // to that marker's label. Off by default: it changes the game's own stations, so the
  // player opts in.
  nameStationsFromMarkers: boolean
  radiusMeters: number
  showInfluence: boolean
  showLabels: boolean
  // When on, the markers of each folder are joined by a smooth line, in panel order —
  // a guide for where the track should run.
  showRouteLines: boolean
  showSpacingGuide: boolean
  snapToSpacing: boolean
}

// A station's typical walkable catchment is ~500 m (a 1 km diameter), so that's the
// default radius; the config tab lets the player tune it between these bounds.
export const DEFAULT_RADIUS_METERS = 500
export const MIN_RADIUS_METERS = 100
export const MAX_RADIUS_METERS = 2000
export const RADIUS_STEP_METERS = 50

// With the panel closed the markers are a background sketch under the game's own map,
// so they fade back by default. 1 keeps them fully opaque (the fade off) and 0 hides
// them outright — safe to reach, because the panel is what brings them back and it
// always draws them fully opaque, and because a faded overlay takes no clicks
// (`setInteractive`), so nothing invisible can be in the way.
export const DEFAULT_IDLE_OPACITY = 0.5
export const MIN_IDLE_OPACITY = 0
export const MAX_IDLE_OPACITY = 1
export const IDLE_OPACITY_STEP = 0.05

export const DEFAULT_SETTINGS: MarkerSettings = {
  idleOpacity: DEFAULT_IDLE_OPACITY,
  nameStationsFromMarkers: false,
  radiusMeters: DEFAULT_RADIUS_METERS,
  showInfluence: true,
  showLabels: true,
  showRouteLines: true,
  showSpacingGuide: true,
  snapToSpacing: true,
}

// Coerce a stored/partial settings object into a valid one, healing missing or
// out-of-range fields against the defaults.
export function normalizeSettings(value: null | Partial<MarkerSettings> | undefined): MarkerSettings {
  return {
    idleOpacity: coerce(value?.idleOpacity, DEFAULT_IDLE_OPACITY, MIN_IDLE_OPACITY, MAX_IDLE_OPACITY),
    nameStationsFromMarkers: coerceToggle(value?.nameStationsFromMarkers, false),
    radiusMeters: coerce(value?.radiusMeters, DEFAULT_RADIUS_METERS, MIN_RADIUS_METERS, MAX_RADIUS_METERS),
    showInfluence: coerceToggle(value?.showInfluence, true),
    showLabels: coerceToggle(value?.showLabels, true),
    showRouteLines: coerceToggle(value?.showRouteLines, true),
    showSpacingGuide: coerceToggle(value?.showSpacingGuide, true),
    snapToSpacing: coerceToggle(value?.snapToSpacing, true),
  }
}

// Compared across every field rather than one by one, so adding a setting can't
// silently skip the check (both sides come from normalizeSettings, so both are whole).
export function settingsEqual(one: MarkerSettings, other: MarkerSettings): boolean {
  return (Object.keys(one) as (keyof MarkerSettings)[]).every((key) => one[key] === other[key])
}

function coerce(value: number | undefined, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback
}

// Anything that isn't a boolean is a malformed payload, so it takes the default —
// the same bar the numbers are held to. Reading truthiness instead would turn a
// stored `"false"` or `0` into "on", silently flipping a setting the player turned off.
function coerceToggle(value: boolean | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}
