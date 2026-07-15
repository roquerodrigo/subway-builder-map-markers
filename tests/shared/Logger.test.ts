import { afterEach, describe, expect, it, vi } from 'vitest'

import { Logger, logger } from '@/shared/Logger'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Logger', () => {
  it('tags every level so the mod messages stay greppable', () => {
    const spies = {
      error: vi.spyOn(console, 'error').mockImplementation(() => undefined),
      log: vi.spyOn(console, 'log').mockImplementation(() => undefined),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    }
    const tagged = new Logger('[Tag]')
    tagged.error('boom')
    tagged.log('hello')
    tagged.warn('careful')
    expect(spies.error).toHaveBeenCalledWith('[Tag]', 'boom')
    expect(spies.log).toHaveBeenCalledWith('[Tag]', 'hello')
    expect(spies.warn).toHaveBeenCalledWith('[Tag]', 'careful')
  })

  it('forwards every argument after the tag', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    new Logger('[Tag]').log('one', 2, { three: true })
    expect(spy).toHaveBeenCalledWith('[Tag]', 'one', 2, { three: true })
  })

  it('logs the tag alone when there is nothing to say', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    new Logger('[Tag]').warn()
    expect(spy).toHaveBeenCalledWith('[Tag]')
  })

  it('ships a shared logger tagged for this mod', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logger.error('disabled')
    expect(spy).toHaveBeenCalledWith('[MapMarkers]', 'disabled')
  })
})
