import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import perfectionist from 'eslint-plugin-perfectionist'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

// Adapted from roquerodrigo/nextjs-boilerplate. This is not a Next.js app, so the
// eslint-config-next presets are dropped and the plugins Next bundled (React,
// React Hooks, jsx-a11y, typescript-eslint) are registered directly. The mod uses
// the classic JSX runtime (host React via the `h`/`Fragment` factory), so the
// React pragma is set so jsx-uses-vars keeps those imports from reading as unused.
const eslintConfig = defineConfig([
  globalIgnores([
    'dist/**',
    'node_modules/**',
    'logs/**',
    'scripts/**',
    'eslint.config.mjs',
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  perfectionist.configs['recommended-natural'],
  stylistic.configs.customize({
    arrowParens: 'always',
    flat: true,
  }),
  {
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],
      '@stylistic/operator-linebreak': ['error', 'after'],
      // A blank line before a return separates what a function works out from what
      // it hands back. Only when something precedes it — a lone return stays tight.
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', next: 'return', prev: '*' },
      ],
      'curly': ['error', 'all'],
    },
  },
  {
    name: 'jsx-a11y/recommended-rules',
    plugins: {
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  // Classic JSX runtime: the host supplies React, and JSX compiles to `h(...)`.
  // jsx-uses-react/vars (with the pragma set) mark the `h`/`Fragment` imports as
  // used so no-unused-vars doesn't flag them.
  {
    name: 'react/jsx-runtime-pragma',
    plugins: {
      react,
    },
    settings: {
      react: { pragma: 'h', pragmaFrag: 'Fragment', version: '18.0' },
    },
    rules: {
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
    },
  },
  {
    name: 'react-hooks/recommended-rules',
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  // type-aware (só .ts/.tsx)
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/await-thenable': 'error',
      // Still require `import type` for imports, but allow inline `import()` type
      // annotations — the host-React shim types the module via `typeof import('react')`.
      '@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/require-await': 'error',
    },
  },
])

export default eslintConfig
