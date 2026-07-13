// The game renders the floating panel as a `position: fixed` wrapper positioned by
// inline left/top, and persists that geometry to localStorage under
// `floating-panel-<id>`. A stale saved position (from a different window size, or a
// stray drag past the edge) can restore the window off-screen and out of reach.
//
// Given our panel's content element, walk up to that fixed wrapper and, if it sits
// even partly outside the viewport, clamp it fully back in — updating both the live
// element and the persisted geometry so the fix sticks. A window already on-screen
// is left untouched.

const STORAGE_KEY = 'floating-panel-map-markers'
const MARGIN = 8

// Clamp the *persisted* geometry against the current viewport, without needing the
// window in the DOM. Called at startup (and on the lifecycle hooks) so the game
// reads an on-screen position when it next opens the panel — which keeps the game's
// own position state consistent, so a later drag doesn't jump. The on-mount DOM
// clamp above is the belt-and-suspenders that guarantees reachability regardless.
export function clampStoredPanelGeometry(): void {
  let raw: null | string
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return
  }
  if (!raw) {
    return
  }
  let geometry: { height?: unknown, width?: unknown, x?: unknown, y?: unknown }
  try {
    geometry = JSON.parse(raw)
  } catch {
    return
  }
  if (typeof geometry.x !== 'number' || typeof geometry.y !== 'number') {
    return
  }
  const width = typeof geometry.width === 'number' ? geometry.width : 380
  const height = typeof geometry.height === 'number' ? geometry.height : 560
  const maxLeft = Math.max(MARGIN, window.innerWidth - width - MARGIN)
  const maxTop = Math.max(MARGIN, window.innerHeight - height - MARGIN)
  const x = clamp(geometry.x, MARGIN, maxLeft)
  const y = clamp(geometry.y, MARGIN, maxTop)
  if (x === geometry.x && y === geometry.y) {
    return
  }
  persist(x, y, width, height)
}

export function ensurePanelOnScreen(content: HTMLElement | null): void {
  const wrapper = fixedAncestor(content)
  if (!wrapper) {
    return
  }
  const rect = wrapper.getBoundingClientRect()
  const maxLeft = Math.max(MARGIN, window.innerWidth - rect.width - MARGIN)
  const maxTop = Math.max(MARGIN, window.innerHeight - rect.height - MARGIN)
  const left = clamp(rect.left, MARGIN, maxLeft)
  const top = clamp(rect.top, MARGIN, maxTop)
  if (Math.abs(left - rect.left) < 1 && Math.abs(top - rect.top) < 1) {
    return // already fully on-screen — don't disturb it
  }
  wrapper.style.left = `${Math.round(left)}px`
  wrapper.style.top = `${Math.round(top)}px`
  persist(Math.round(left), Math.round(top), Math.round(rect.width), Math.round(rect.height))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function fixedAncestor(element: HTMLElement | null): HTMLElement | null {
  let node = element
  while (node) {
    if (window.getComputedStyle(node).position === 'fixed') {
      return node
    }
    node = node.parentElement
  }
  return null
}

function persist(x: number, y: number, width: number, height: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y, width, height }))
  } catch {
    /* storage unavailable — the live clamp already fixed this open */
  }
}
