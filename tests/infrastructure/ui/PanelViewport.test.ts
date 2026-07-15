import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clampStoredPanelGeometry, ensurePanelOnScreen } from '@/infrastructure/ui/PanelViewport'

const STORAGE_KEY = 'floating-panel-map-markers'

function mountPanel(rect: { height: number, left: number, top: number, width: number }, position = 'fixed') {
  const wrapper = document.createElement('div')
  wrapper.style.position = position
  const content = document.createElement('div')
  wrapper.append(content)
  document.body.append(wrapper)
  wrapper.getBoundingClientRect = () => ({ ...rect, bottom: rect.top + rect.height, right: rect.left + rect.width, toJSON: () => ({}), x: rect.left, y: rect.top })

  return { content, wrapper }
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width, writable: true })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height, writable: true })
}

function storedGeometry(): null | Record<string, number> {
  const raw = window.localStorage.getItem(STORAGE_KEY)

  return raw === null ? null : JSON.parse(raw)
}

beforeEach(() => {
  document.body.innerHTML = ''
  setViewport(1800, 1000)
})

describe('clampStoredPanelGeometry', () => {
  it('does nothing when the game has saved no geometry yet', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    clampStoredPanelGeometry()
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })

  it('leaves a geometry that is already on-screen untouched', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ height: 560, width: 380, x: 100, y: 80 }))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    clampStoredPanelGeometry()
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })

  it('pulls a stale off-screen position back inside the viewport before the game reads it', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ height: 560, width: 380, x: 3000, y: 80 }))
    clampStoredPanelGeometry()
    expect(storedGeometry()).toEqual({ height: 560, width: 380, x: 1412, y: 80 })
  })

  it('pulls a position back from above and to the left of the viewport', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ height: 560, width: 380, x: -500, y: -200 }))
    clampStoredPanelGeometry()
    expect(storedGeometry()).toEqual({ height: 560, width: 380, x: 8, y: 8 })
  })

  it('clamps against the bottom edge of the viewport', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ height: 560, width: 380, x: 100, y: 4000 }))
    clampStoredPanelGeometry()
    expect(storedGeometry()?.y).toBe(1000 - 560 - 8)
  })

  it('assumes the default panel size when the saved geometry has none', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: 3000, y: 80 }))
    clampStoredPanelGeometry()
    expect(storedGeometry()).toEqual({ height: 560, width: 380, x: 1412, y: 80 })
  })

  it('keeps the panel reachable when it is wider than the viewport', () => {
    setViewport(320, 240)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ height: 560, width: 380, x: 3000, y: 4000 }))
    clampStoredPanelGeometry()
    expect(storedGeometry()).toEqual({ height: 560, width: 380, x: 8, y: 8 })
  })

  it('ignores a payload that is not valid JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json')
    clampStoredPanelGeometry()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('{not json')
  })

  it('ignores a payload with no numeric position', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: '3000', y: null }))
    clampStoredPanelGeometry()
    expect(storedGeometry()).toEqual({ x: '3000', y: null })
  })

  it('ignores a payload that is missing the position entirely', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 380 }))
    clampStoredPanelGeometry()
    expect(storedGeometry()).toEqual({ width: 380 })
  })

  it('gives up quietly when storage cannot be read', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    expect(() => clampStoredPanelGeometry()).not.toThrow()
    getItem.mockRestore()
  })

  it('gives up quietly when storage cannot be written', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ height: 560, width: 380, x: 3000, y: 80 }))
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => clampStoredPanelGeometry()).not.toThrow()
    setItem.mockRestore()
  })
})

describe('ensurePanelOnScreen', () => {
  it('does nothing without a panel element', () => {
    expect(() => ensurePanelOnScreen(null)).not.toThrow()
  })

  it('does nothing when the panel has no fixed wrapper to move', () => {
    const { content } = mountPanel({ height: 560, left: 3000, top: 40, width: 380 }, 'static')
    ensurePanelOnScreen(content)
    expect(storedGeometry()).toBeNull()
  })

  it('leaves a window that is already fully on-screen alone', () => {
    const { content, wrapper } = mountPanel({ height: 560, left: 100, top: 80, width: 380 })
    ensurePanelOnScreen(content)
    expect(wrapper.style.left).toBe('')
    expect(storedGeometry()).toBeNull()
  })

  it('pulls a window restored off the right edge back into reach', () => {
    const { content, wrapper } = mountPanel({ height: 560, left: 3000, top: 40, width: 380 })
    ensurePanelOnScreen(content)
    expect(wrapper.style.left).toBe('1412px')
    expect(wrapper.style.top).toBe('40px')
  })

  it('persists the clamped geometry so the fix survives the next open', () => {
    const { content } = mountPanel({ height: 560, left: 3000, top: 40, width: 380 })
    ensurePanelOnScreen(content)
    expect(storedGeometry()).toEqual({ height: 560, width: 380, x: 1412, y: 40 })
  })

  it('pulls a window restored above the viewport back into reach', () => {
    const { content, wrapper } = mountPanel({ height: 560, left: 100, top: -400, width: 380 })
    ensurePanelOnScreen(content)
    expect(wrapper.style.top).toBe('8px')
    expect(wrapper.style.left).toBe('100px')
  })

  it('walks up past intermediate elements to find the fixed wrapper', () => {
    const { content, wrapper } = mountPanel({ height: 560, left: 3000, top: 40, width: 380 })
    const nested = document.createElement('div')
    content.append(nested)
    ensurePanelOnScreen(nested)
    expect(wrapper.style.left).toBe('1412px')
  })

  it('tolerates a sub-pixel offset rather than nudging the window', () => {
    const { content, wrapper } = mountPanel({ height: 560, left: 8.4, top: 8.4, width: 380 })
    ensurePanelOnScreen(content)
    expect(wrapper.style.left).toBe('')
    expect(storedGeometry()).toBeNull()
  })

  it('still moves the live window when the clamped geometry cannot be persisted', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const { content, wrapper } = mountPanel({ height: 560, left: 3000, top: 40, width: 380 })
    expect(() => ensurePanelOnScreen(content)).not.toThrow()
    expect(wrapper.style.left).toBe('1412px')
    setItem.mockRestore()
  })
})
