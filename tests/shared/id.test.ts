import { afterEach, describe, expect, it, vi } from 'vitest'

import { newId } from '@/shared/id'

const FALLBACK_ID = /^m-[0-9a-z]+-[0-9a-z]+$/

describe('newId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the platform uuid generator when there is one', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-from-platform' })
    expect(newId()).toBe('uuid-from-platform')
  })

  it('falls back to a generated id when the platform has no crypto', () => {
    vi.stubGlobal('crypto', undefined)
    expect(newId()).toMatch(FALLBACK_ID)
  })

  it('falls back to a generated id when crypto cannot make uuids', () => {
    vi.stubGlobal('crypto', {})
    expect(newId()).toMatch(FALLBACK_ID)
  })

  it('keeps the fallback ids distinct within the same millisecond', () => {
    vi.stubGlobal('crypto', {})
    const ids = new Set(Array.from({ length: 50 }, () => newId()))
    expect(ids.size).toBe(50)
  })
})
