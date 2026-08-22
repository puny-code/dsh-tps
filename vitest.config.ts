import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

/**
 * Vitest resolution: the project tsconfig resolves the @deepseek-ai/dsh-*
 * peer packages from node_modules (rc6 range); no sibling harness checkout
 * is involved anymore.
 */
export default defineConfig({
  plugins: [tsconfigPaths({
    projects: ['./tsconfig.vitest.json'],
  })],
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    pool: 'forks',
  },
})
