import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Mirrors scripts/build.mjs and tsconfig: JSX compiles to `h`, which every .tsx
  // imports from infrastructure/ui/react — so tests exercise the same host-React
  // wiring the game uses, rather than a bundled React the mod never ships.
  oxc: {
    jsx: {
      pragma: 'h',
      pragmaFrag: 'Fragment',
      runtime: 'classic',
    },
  },
  // Mirrors the `@/*` paths in tsconfig, which esbuild reads on its own but vite
  // does not.
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    coverage: {
      exclude: [
        // Not code — the mod's metadata, validated by scripts/package-release.mjs.
        'src/manifest.json',
        // Type-only contracts: no statements to cover.
        'src/shared/game/**',
        // The composition root only wires the real game API together; there is
        // nothing here that a test could assert that the parts don't already.
        'src/main.tsx',
      ],
      include: ['src/**'],
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // The host React has to be on globalThis before any mod module is imported:
    // infrastructure/ui/react reads it at module-init, and imports hoist.
    setupFiles: ['tests/setup.ts'],
  },
})
