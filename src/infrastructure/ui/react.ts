// The host supplies React at runtime (window.SubwayBuilderAPI.utils.React); the
// mod must never bundle its own. Read it defensively — a missing API must not
// throw at module-init (imports hoist, so this runs before main.tsx's guard),
// or the whole IIFE would crash before it can disable itself gracefully.
//
// Every .tsx imports { h, Fragment } from here so both esbuild (jsxFactory:"h")
// and tsc resolve the JSX factory to the host React. This module imports nothing
// from the mod, so there are no cycles.

type ReactModule = typeof import('react')

const hostReact = (globalThis as unknown as {
  SubwayBuilderAPI?: { utils?: { React?: ReactModule } }
}).SubwayBuilderAPI?.utils?.React

export const React = hostReact as ReactModule

// createElement is a free function (no `this`), so capturing it unbound is safe.
export const h = hostReact?.createElement as ReactModule['createElement']
export const Fragment = hostReact?.Fragment as ReactModule['Fragment']

export const isReactAvailable = (): boolean => !!hostReact && typeof h === 'function'
