import type { MarkerGroup } from '@/domain/group/MarkerGroup'

import { newId } from '@/shared/id'

// A fresh folder with a fresh id, shown and empty. The name is whatever the caller
// passes (the panel seeds a numbered default the player then renames); the optional
// color lets a folder carry its line color.
export function createGroup(name: string, color: null | string = null): MarkerGroup {
  return {
    collapsed: false,
    color,
    hidden: false,
    id: newId(),
    name,
  }
}
