import { h } from '@/infrastructure/ui/react'

export interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
}

// A labeled on/off switch (a `role="switch"` button). The switch track and knob
// use inline styles rather than Tailwind classes: the game ships a *prebuilt*
// Tailwind CSS that only includes the classes it uses, so switch-specific ones
// (`left-0.5`, `top-0.5`) are missing and would leave the knob mispositioned — and
// its `--primary` is near-white, which would hide a white knob when "on". Explicit
// colors keep the contrast right in the panel's dark surface either way.
export function Toggle({ label, checked, onChange, description }: ToggleProps): JSX.Element {
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
          position: 'relative',
          flexShrink: 0,
          width: '36px',
          height: '20px',
          padding: 0,
          border: 'none',
          borderRadius: '9999px',
          cursor: 'pointer',
          background: checked ? '#3b82f6' : 'rgba(148, 163, 184, 0.4)',
          transition: 'background 120ms ease',
        }}
        type="button"
      >
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: checked ? '18px' : '2px',
            width: '16px',
            height: '16px',
            borderRadius: '9999px',
            background: '#ffffff',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
            transition: 'left 120ms ease',
          }}
        />
      </button>
    </div>
  )
}
