import type { DragEvent } from 'react'

import type { MarkerGroup } from '@/domain/group/MarkerGroup'
import type { Marker } from '@/domain/marker/Marker'
import type { DropSide } from '@/domain/ordering/ItemOrder'

import { markerIcon } from '@/domain/marker/MarkerIconSet'
import { h, React } from '@/infrastructure/ui/react'
import { ColorSwatches } from '@/presentation/components/ColorSwatches'
import { DragHandle } from '@/presentation/components/DragHandle'
import { IconGlyph } from '@/presentation/components/IconGlyph'
import { IconPicker } from '@/presentation/components/IconPicker'
import { CARD_CLASS, dropIndicatorShadow, selectedCardStyle } from '@/presentation/theme'

// Everything the card needs to take part in a reorder. Absent, the card renders exactly
// as it did before, which is what the tests around a lone card rely on.
export interface MarkerCardDrag {
  dragging: boolean
  hint: DropSide | null
  onDragEnd: () => void
  onDragLeave: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

export interface MarkerCardProps {
  drag?: MarkerCardDrag
  // Every folder on the board. Absent/empty hides the folder controls, so a board with
  // no folders keeps the card unchanged.
  groups?: MarkerGroup[]
  marker: Marker
  // The folders this marker is on — more than one where lines meet.
  memberships?: MarkerGroup[]
  onAddToGroup?: (groupId: string) => void
  onFocus: () => void
  onRemove: () => void
  onRemoveFromGroup?: (groupId: string) => void
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

// One marker's controls: its badge, an editable label, color + icon pickers, the
// folders it is on, and a remove action. Clicking any empty part of the card centres
// the map on the marker. Selecting the card highlights the matching badge on the map
// (and vice-versa).
export function MarkerCard(
  { drag, groups, marker, memberships, onAddToGroup, onFocus, onRemove, onRemoveFromGroup, onSelect, onUpdate, selected }: MarkerCardProps,
): JSX.Element {
  const cardRef = React.useRef<HTMLDivElement>(null)
  const on = memberships ?? []
  const available = (groups ?? []).filter((group) => !on.some((held) => held.id === group.id))

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
      onDragLeave={drag?.onDragLeave}
      onDragOver={drag?.onDragOver}
      onDrop={drag?.onDrop}
      ref={cardRef}
      style={cardStyle(marker.color, selected, drag)}
    >
      <div className="flex items-center gap-2" style={CONTROL_LAYER}>
        {drag ?
            <DragHandle label="Reorder marker" onDragEnd={drag.onDragEnd} onDragStart={drag.onDragStart} /> :
          null}
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
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" style={CONTROL_LAYER}>
              <span className="shrink-0">Folders</span>
              {on.map((group) => (
                <span
                  className="flex items-center gap-1 rounded-full border border-border bg-primary/5 py-0.5 pl-2 pr-1"
                  key={group.id}
                  style={{ borderColor: group.color ?? undefined }}
                >
                  {group.name}
                  <button
                    aria-label={`Take off ${group.name || 'folder'}`}
                    className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-red-500/25 hover:text-red-300"
                    onClick={(event) => {
                      event.stopPropagation()
                      onRemoveFromGroup?.(group.id)
                    }}
                    title="Take this marker off that folder's line"
                    type="button"
                  >
                    <svg fill="none" height="9" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="9">
                      <line x1="6" x2="18" y1="6" y2="18" />
                      <line x1="18" x2="6" y1="6" y2="18" />
                    </svg>
                  </button>
                </span>
              ))}
              {on.length === 0 ? <span className="rounded-full px-1">None</span> : null}
              {available.length > 0 ?
                  (
                    <select
                      aria-label="Add to folder"
                      className="min-w-0 flex-1 rounded-md border border-border bg-primary/5 px-2 py-1 text-xs"
                      onChange={(event) => {
                        if (event.target.value) {
                          onAddToGroup?.(event.target.value)
                        }
                      }}
                      value=""
                    >
                      <option value="">Add to folder…</option>
                      {available.map((group) => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </select>
                  ) :
                null}
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

// Selection colours the card; a drop hint draws a line on the edge the marker would
// land against. Both are box-shadows, so a card that is selected and hovered keeps
// showing the selection under the line.
function cardStyle(color: string, selected: boolean, drag: MarkerCardDrag | undefined): Record<string, string> {
  const style: Record<string, string> = { position: 'relative', ...(selected ? selectedCardStyle(color) : {}) }
  if (drag?.hint) {
    style.boxShadow = [style.boxShadow, dropIndicatorShadow(drag.hint)].filter(Boolean).join(', ')
  }
  if (drag?.dragging) {
    style.opacity = '0.4'
  }

  return style
}
