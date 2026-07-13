// Global display settings for the markers overlay (not per-marker): the influence
// radius, how visible the overlay is while the panel is closed, and the show/hide
// toggles the config tab edits. Pure data.
export interface MarkerSettings {
  idleOpacity: number
  radiusMeters: number
  showInfluence: boolean
  showLabels: boolean
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
// so they fade back by default. 1 keeps them fully opaque (the fade off); the floor
// stays clear of 0 so they can never vanish with no way to tell why.
export const DEFAULT_IDLE_OPACITY = 0.5
export const MIN_IDLE_OPACITY = 0.1
export const MAX_IDLE_OPACITY = 1
export const IDLE_OPACITY_STEP = 0.05

export const DEFAULT_SETTINGS: MarkerSettings = {
  idleOpacity: DEFAULT_IDLE_OPACITY,
  radiusMeters: DEFAULT_RADIUS_METERS,
  showInfluence: true,
  showLabels: true,
  showSpacingGuide: true,
  snapToSpacing: true,
}

// Coerce a stored/partial settings object into a valid one, healing missing or
// out-of-range fields against the defaults.
export function normalizeSettings(value: null | Partial<MarkerSettings> | undefined): MarkerSettings {
  return {
    idleOpacity: coerce(value?.idleOpacity, DEFAULT_IDLE_OPACITY, MIN_IDLE_OPACITY, MAX_IDLE_OPACITY),
    radiusMeters: coerce(value?.radiusMeters, DEFAULT_RADIUS_METERS, MIN_RADIUS_METERS, MAX_RADIUS_METERS),
    showInfluence: value?.showInfluence !== false,
    showLabels: value?.showLabels !== false,
    showSpacingGuide: value?.showSpacingGuide !== false,
    snapToSpacing: value?.snapToSpacing !== false,
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
