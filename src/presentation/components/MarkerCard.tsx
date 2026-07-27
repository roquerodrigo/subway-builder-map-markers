import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'

import { markerIcon } from '@/domain/marker/MarkerIconSet'
import { h, React } from '@/infrastructure/ui/react'
import { ColorSwatches } from '@/presentation/components/ColorSwatches'
import { IconGlyph } from '@/presentation/components/IconGlyph'
import { IconPicker } from '@/presentation/components/IconPicker'
import { CARD_CLASS, selectedCardStyle } from '@/presentation/theme'

export interface MarkerCardProps {
  // The folders a marker can be moved into. Absent/empty hides the folder picker, so a
  // board with no folders keeps the card unchanged.
  groups?: MarkerGroup[]
  marker: Marker
  onAssign?: (groupId: null | string) => void
  onFocus: () => void
  onRemove: () => void
  onSelect: () => void
  onUpdate: (patch: Partial<Omit<Marker, 'id'>>) => void
  selected: boolean
}

// Centring is a real button stretched behind the card rather than a click handler on
// the card itself: it keeps the keyboard and screen-reader behaviour of a control for
// free, where a clickable <div> wrapped around the actual controls would have to fake
// both. The controls sit on the layer above it, so each still takes its own click and
// only the space between them reaches the button.
const CENTRE_BACKDROP = { inset: 0, marginTop: 0, position: 'absolute', zIndex: 0 } as const
const CONTROL_LAYER = { position: 'relative', zIndex: 1 } as const

// One marker's controls: its badge, an editable label, color + icon pickers, an
// optional folder picker, and a remove action. Clicking any empty part of the card
// centres the map on the marker. Selecting the card highlights the matching badge on
// the map (and vice-versa).
export function MarkerCard(
  { groups, marker, onAssign, onFocus, onRemove, onSelect, onUpdate, selected }: MarkerCardProps,
): JSX.Element {
  const cardRef = React.useRef<HTMLDivElement>(null)

  // Selection usually starts on the map (clicking or dropping a badge), and the
  // matching card is often scrolled out of sight — highlighting it there would be
  // invisible. 'nearest' only scrolls when it actually needs to.
  React.useEffect(() => {
    if (selected) {
      cardRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [selected])

  return (
    <div
      className={CARD_CLASS}
      ref={cardRef}
      style={{ position: 'relative', ...(selected ? selectedCardStyle(marker.color) : {}) }}
    >
      <div className="flex items-center gap-2" style={CONTROL_LAYER}>
        <button
          aria-label="Highlight marker on the map"
          aria-pressed={selected}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-white"
          onClick={onSelect}
          style={{ background: marker.color }}
          title="Highlight on the map"
          type="button"
        >
          <IconGlyph color="#ffffff" icon={markerIcon(marker.icon)} size={18} />
        </button>
        <input
          aria-label="Marker name"
          className="min-w-0 flex-1 rounded-md border border-border bg-primary/5 px-2 py-1 text-sm"
          onChange={(event) => onUpdate({ label: event.target.value })}
          placeholder="Unnamed"
          value={marker.label}
        />
        <button
          aria-label="Remove marker"
          className="flex h-7 w-7 items-center justify-center rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          title="Remove marker"
          type="button"
        >
          <svg fill="none" height="16" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16">
            <line x1="6" x2="18" y1="6" y2="18" />
            <line x1="18" x2="6" y1="6" y2="18" />
          </svg>
        </button>
      </div>

      <div style={CONTROL_LAYER}>
        <ColorSwatches onChange={(color) => onUpdate({ color })} value={marker.color} />
      </div>
      <div style={CONTROL_LAYER}>
        <IconPicker color={marker.color} onChange={(icon) => onUpdate({ icon })} value={marker.icon} />
      </div>

      {groups && groups.length > 0 ?
          (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" style={CONTROL_LAYER}>
              <span className="shrink-0">Folder</span>
              <select
                aria-label="Move to folder"
                className="min-w-0 flex-1 rounded-md border border-border bg-primary/5 px-2 py-1 text-xs"
                onChange={(event) => onAssign?.(event.target.value || null)}
                value={marker.groupId ?? ''}
              >
                <option value="">No folder</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>
          ) :
        null}

      <button
        aria-label="Centre the map on this marker"
        className="cursor-pointer rounded-lg"
        onClick={onFocus}
        style={CENTRE_BACKDROP}
        title="Centre the map here"
        type="button"
      />
    </div>
  )
}
