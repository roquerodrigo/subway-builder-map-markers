import * as ReactModule from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Fragment, h, isReactAvailable, React } from '@/infrastructure/ui/react'

const SHIM_PATH = '../../../src/infrastructure/ui/react'

// The shim reads the host React once, at module init. Re-importing it against a
// different globalThis is the only way to exercise the host-missing branches.
async function importShimWith(hostApi: unknown): Promise<typeof import('../../../src/infrastructure/ui/react')> {
  const host = globalThis as unknown as Record<string, unknown>
  const original = host.SubwayBuilderAPI
  host.SubwayBuilderAPI = hostApi
  try {
    vi.resetModules()
    return await import(SHIM_PATH)
  } finally {
    host.SubwayBuilderAPI = original
    vi.resetModules()
  }
}

describe('react shim', () => {
  it('takes React from the host instead of bundling its own', () => {
    expect(React).toBe(ReactModule)
    expect(h).toBe(ReactModule.createElement)
    expect(Fragment).toBe(ReactModule.Fragment)
  })

  it('reports React as available when the host supplies it', () => {
    expect(isReactAvailable()).toBe(true)
  })

  it('reports React as unavailable when there is no host API at all', async () => {
    const shim = await importShimWith(undefined)
    expect(shim.isReactAvailable()).toBe(false)
  })

  it('reports React as unavailable when the host API carries no utils', async () => {
    const shim = await importShimWith({})
    expect(shim.isReactAvailable()).toBe(false)
  })

  it('reports React as unavailable when the host utils carry no React', async () => {
    const shim = await importShimWith({ utils: {} })
    expect(shim.isReactAvailable()).toBe(false)
  })

  it('reports React as unavailable when the host React has no createElement', async () => {
    const shim = await importShimWith({ utils: { React: {} } })
    expect(shim.isReactAvailable()).toBe(false)
  })

  it('initialises without throwing when the host API is missing, so the mod can disable itself', async () => {
    const shim = await importShimWith(undefined)
    expect(shim.h).toBeUndefined()
    expect(shim.Fragment).toBeUndefined()
  })
})
