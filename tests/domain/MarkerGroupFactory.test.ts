import { describe, expect, it } from 'vitest'

import { createGroup } from '@/domain/group/MarkerGroupFactory'

describe('createGroup', () => {
  it('creates a visible, expanded, empty, uncolored folder from a name', () => {
    const group = createGroup('Line 1 - Azul')
    expect(group.name).toBe('Line 1 - Azul')
    expect(group.hidden).toBe(false)
    expect(group.color).toBeNull()
    expect(typeof group.id).toBe('string')
  })

  it('carries an optional line color', () => {
    expect(createGroup('Line 1 - Azul', '#0a4d9c').color).toBe('#0a4d9c')
  })

  it('gives every folder its own id', () => {
    const ids = new Set(Array.from({ length: 25 }, () => createGroup('folder').id))
    expect(ids.size).toBe(25)
  })
})
