import type { Marker } from '../../domain/marker/Marker'

import { markerIcon } from '../../domain/marker/MarkerIconSet'
import { h, React } from '../../infrastructure/ui/react'
import { CARD_CLASS, selectedCardStyle } from '../theme'
import { ColorSwatches } from './ColorSwatches'
import { IconGlyph } from './IconGlyph'
import { IconPicker } from './IconPicker'

export interface MarkerCardProps {
  marker: Marker
  selected: boolean
  onSelect: () => void
  onUpdate: (patch: Partial<Omit<Marker, 'id'>>) => void
  onFocus: () => void
  onRemove: () => void
}

// One marker's controls: its badge, an editable label, color + icon pickers, the
// 1 km radius toggle, and focus/remove actions. Selecting the card highlights the
// matching badge on the map (and vice-versa).
export function MarkerCard({ marker, selected, onSelect, onUpdate, onFocus, onRemove }: MarkerCardProps): JSX.Element {
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
      style={selected ? selectedCardStyle(marker.color) : undefined}
    >
      <div className="flex items-center gap-2">
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
          aria-label="Center on the map"
          className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-muted-foreground hover:bg-primary/20"
          onClick={(event) => {
            event.stopPropagation()
            onFocus()
          }}
          title="Center on the map"
          type="button"
        >
          <svg fill="none" height="16" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="16">
            <circle cx="12" cy="12" r="7" />
            <line x1="12" x2="12" y1="1.5" y2="4.5" />
            <line x1="12" x2="12" y1="19.5" y2="22.5" />
            <line x1="1.5" x2="4.5" y1="12" y2="12" />
            <line x1="19.5" x2="22.5" y1="12" y2="12" />
          </svg>
        </button>
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

      <ColorSwatches onChange={(color) => onUpdate({ color })} value={marker.color} />
      <IconPicker color={marker.color} onChange={(icon) => onUpdate({ icon })} value={marker.icon} />
    </div>
  )
}
