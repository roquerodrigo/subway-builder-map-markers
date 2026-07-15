import { cleanup } from '@testing-library/react'
import * as ReactModule from 'react'
import { afterEach } from 'vitest'

// The mod never bundles React: it reads the host's copy off
// window.SubwayBuilderAPI at module-init (see infrastructure/ui/react). Tests have
// to stand in as that host, and this has to happen before any mod module is
// imported — which is why it lives in setupFiles rather than in a test.
Object.defineProperty(globalThis, 'SubwayBuilderAPI', {
  configurable: true,
  value: { utils: { React: ReactModule } },
  writable: true,
})

// Unmount between tests: without vitest's globals, testing-library can't register
// this itself, and rendered trees would pile up in the same document.
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})
