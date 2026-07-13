import { MARKER_ICONS } from '../../domain/marker/MarkerIconSet'
import { h } from '../../infrastructure/ui/react'
import { IconGlyph } from './IconGlyph'

export interface IconPickerProps {
  value: string
  color: string
  onChange: (icon: string) => void
}

// The icon set as a row of toggle buttons; the current icon is highlighted and
// tinted with the marker's color.
export function IconPicker({ value, color, onChange }: IconPickerProps): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {MARKER_ICONS.map((icon) => {
        const selected = icon.key === value
        return (
          <button
            aria-label={icon.label}
            aria-pressed={selected}
            className={
              'flex h-7 w-7 items-center justify-center rounded-md border transition ' +
              (selected ?
                'border-white bg-white/10 text-foreground' :
                'border-border bg-primary/5 text-muted-foreground hover:bg-primary/10')
            }
            key={icon.key}
            onClick={() => onChange(icon.key)}
            title={icon.label}
            type="button"
          >
            <IconGlyph color={selected ? color : 'currentColor'} icon={icon} size={16} />
          </button>
        )
      })}
    </div>
  )
}
