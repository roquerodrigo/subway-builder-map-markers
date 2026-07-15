import type { SettingsStore } from '@/application/SettingsStore'

import {
  IDLE_OPACITY_STEP,
  MAX_IDLE_OPACITY,
  MAX_RADIUS_METERS,
  MIN_IDLE_OPACITY,
  MIN_RADIUS_METERS,
  RADIUS_STEP_METERS,
} from '@/domain/settings/MarkerSettings'
import { h } from '@/infrastructure/ui/react'
import { Toggle } from '@/presentation/components/Toggle'
import { useSettings } from '@/presentation/hooks/useSettings'

export interface SettingsTabProps {
  settings: SettingsStore
}

function radiusSummary(radiusMeters: number): string {
  const km = (radiusMeters * 2) / 1000
  const diameter = km.toLocaleString('en-US', { maximumFractionDigits: 1 })
  return `${radiusMeters} m · ${diameter} km across`
}

function idleOpacitySummary(idleOpacity: number): string {
  const percent = `${Math.round(idleOpacity * 100)}%`
  return idleOpacity >= MAX_IDLE_OPACITY ? `${percent} · no fading` : percent
}

// The global display settings: the influence radius and the show/hide toggles.
// Editing here writes to the shared SettingsStore, which the map layers observe.
export function SettingsTab({ settings }: SettingsTabProps): JSX.Element {
  const current = useSettings(settings)
  return (
    <div className="space-y-4 pt-1">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <label className="text-sm font-medium" htmlFor="sbmm-radius">Influence radius</label>
          <span className="text-xs text-muted-foreground">{radiusSummary(current.radiusMeters)}</span>
        </div>
        <input
          className="w-full"
          id="sbmm-radius"
          max={MAX_RADIUS_METERS}
          min={MIN_RADIUS_METERS}
          onChange={(event) => settings.update({ radiusMeters: Number(event.target.value) })}
          step={RADIUS_STEP_METERS}
          style={{ accentColor: '#3b82f6' }}
          type="range"
          value={current.radiusMeters}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{`${MIN_RADIUS_METERS} m`}</span>
          <span>{`${MAX_RADIUS_METERS} m`}</span>
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <label className="text-sm font-medium" htmlFor="sbmm-idle-opacity">Opacity while the panel is closed</label>
          <span className="text-xs text-muted-foreground">{idleOpacitySummary(current.idleOpacity)}</span>
        </div>
        <input
          className="w-full"
          id="sbmm-idle-opacity"
          max={MAX_IDLE_OPACITY}
          min={MIN_IDLE_OPACITY}
          onChange={(event) => settings.update({ idleOpacity: Number(event.target.value) })}
          step={IDLE_OPACITY_STEP}
          style={{ accentColor: '#3b82f6' }}
          type="range"
          value={current.idleOpacity}
        />
        <p className="text-xs text-muted-foreground">
          Keeps the markers subtle while you play. They are always fully opaque with the panel open.
        </p>
      </div>

      <div className="space-y-4 border-t border-border pt-4">
        <Toggle
          checked={current.showInfluence}
          description="The radius circle around each marker"
          label="Show influence area"
          onChange={(value) => settings.update({ showInfluence: value })}
        />
        <Toggle
          checked={current.showSpacingGuide}
          description="Guide rings at the ideal spacing between markers"
          label="Show spacing guides"
          onChange={(value) => settings.update({ showSpacingGuide: value })}
        />
        <Toggle
          checked={current.snapToSpacing}
          description="Snaps a dragged marker onto the ideal spacing"
          label="Magnetic snap"
          onChange={(value) => settings.update({ snapToSpacing: value })}
        />
        <Toggle
          checked={current.showLabels}
          description="Each marker's name on the map"
          label="Show names"
          onChange={(value) => settings.update({ showLabels: value })}
        />
      </div>
    </div>
  )
}
