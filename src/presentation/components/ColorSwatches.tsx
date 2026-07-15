import { MARKER_COLORS } from '@/domain/marker/MarkerPalette'
import { h } from '@/infrastructure/ui/react'

export interface ColorSwatchesProps {
  onChange: (color: string) => void
  value: string
}

// The color palette as a row of round swatches; the current color is ringed.
export function ColorSwatches({ onChange, value }: ColorSwatchesProps): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {MARKER_COLORS.map((color) => {
        const selected = color.toLowerCase() === value.toLowerCase()

        return (
          <button
            aria-label={`Choose color ${color}`}
            aria-pressed={selected}
            className={
              'h-6 w-6 rounded-full border transition ' +
              (selected ? 'border-white ring-2 ring-white/70 scale-110' : 'border-black/30 hover:scale-105')
            }
            key={color}
            onClick={() => onChange(color)}
            style={{ background: color }}
            type="button"
          />
        )
      })}
    </div>
  )
}
