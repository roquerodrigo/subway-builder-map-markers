import { h } from '@/infrastructure/ui/react'

export interface ToggleProps {
  checked: boolean
  description?: string
  label: string
  onChange: (checked: boolean) => void
}

// A labeled on/off switch (a `role="switch"` button). The switch track and knob
// use inline styles rather than Tailwind classes: the game ships a *prebuilt*
// Tailwind CSS that only includes the classes it uses, so switch-specific ones
// (`left-0.5`, `top-0.5`) are missing and would leave the knob mispositioned — and
// its `--primary` is near-white, which would hide a white knob when "on". Explicit
// colors keep the contrast right in the panel's dark surface either way.
export function Toggle({ checked, description, label, onChange }: ToggleProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
      </div>
      <button
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        role="switch"
        style={{
          background: checked ? '#3b82f6' : 'rgba(148, 163, 184, 0.4)',
          border: 'none',
          borderRadius: '9999px',
          cursor: 'pointer',
          flexShrink: 0,
          height: '20px',
          padding: 0,
          position: 'relative',
          transition: 'background 120ms ease',
          width: '36px',
        }}
        type="button"
      >
        <span
          style={{
            background: '#ffffff',
            borderRadius: '9999px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
            height: '16px',
            left: checked ? '18px' : '2px',
            position: 'absolute',
            top: '2px',
            transition: 'left 120ms ease',
            width: '16px',
          }}
        />
      </button>
    </div>
  )
}
