import { h } from '@/infrastructure/ui/react'

export type PanelTab = 'markers' | 'settings'

export interface TabBarProps {
  tab: PanelTab
  onSelect: (tab: PanelTab) => void
}

const TABS: { key: PanelTab, label: string }[] = [
  { key: 'markers', label: 'Markers' },
  { key: 'settings', label: 'Settings' },
]

// The two-tab switcher at the top of the panel: the marker list and the global
// display settings.
export function TabBar({ tab, onSelect }: TabBarProps): JSX.Element {
  return (
    <div className="flex gap-1 rounded-md bg-primary/5 p-1">
      {TABS.map((entry) => {
        const active = entry.key === tab
        return (
          <button
            aria-pressed={active}
            className={
              'flex-1 rounded-md py-1.5 text-sm font-medium transition ' +
              (active ?
                'bg-primary text-primary-foreground' :
                'text-muted-foreground hover:bg-primary/10')
            }
            key={entry.key}
            onClick={() => onSelect(entry.key)}
            type="button"
          >
            {entry.label}
          </button>
        )
      })}
    </div>
  )
}
