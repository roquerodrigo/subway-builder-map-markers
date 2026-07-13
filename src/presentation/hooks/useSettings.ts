import type { SettingsStore } from '../../application/SettingsStore'
import type { MarkerSettings } from '../../domain/settings/MarkerSettings'

import { React } from '../../infrastructure/ui/react'

// Subscribe the config tab to the shared SettingsStore so its controls reflect the
// live settings (and any change re-renders the map layers via the controller).
export function useSettings(store: SettingsStore): MarkerSettings {
  const [settings, setSettings] = React.useState<MarkerSettings>(() => store.get())
  React.useEffect(() => {
    const update = (): void => setSettings(store.get())
    update()
    return store.subscribe(update)
  }, [store])
  return settings
}
