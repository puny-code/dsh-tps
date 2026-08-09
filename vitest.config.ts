import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

/**
 * Vitest resolution facade: the plugin tsconfig resolves repo-local packages
 * through the sibling harness's `paths` (both configs contribute — the local
 * one for this repo's files, the base one for `@deepseek-ai/dsh-*`).
 */
export default defineConfig({
  plugins: [tsconfigPaths({
    projects: [
      './tsconfig.vitest.json',
      '../deepseek-harness/tsconfig.base.json',
    ],
  })],
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    pool: 'forks',
  },
})
