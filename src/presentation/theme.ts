// Small shared styling constants for the panel. Spacing sticks to the integer
// Tailwind steps the game's prebuilt CSS actually ships — fractional ones like
// `space-y-2.5` aren't generated and would collapse to 0.
export const CARD_CLASS = 'rounded-lg border border-border bg-primary/5 p-3 space-y-2'

// Selection is styled inline, not with `ring-*` classes: the game's prebuilt Tailwind
// doesn't ship `ring-primary/70`, so it silently rendered Tailwind's *default* blue
// ring at half opacity — a faint accident rather than the intended color.
//
// The card takes the marker's own color, which is what ties it to its badge out on
// the map (selected badges get a white ring + a halo in the same color).
//
// The ring is drawn *inset*: a card fills the scrolling list edge to edge, so an
// outer ring (or drop shadow) is clipped away at the sides while surviving above and
// below, where the list's row gap leaves room — an outline that looked uneven.
export function selectedCardStyle(color: string): Record<string, string> {
  return {
    background: `${color}0f`,
    borderColor: color,
    boxShadow: `inset 0 0 0 1px ${color}`,
  }
}
