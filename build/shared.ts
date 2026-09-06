/**
 * Build-time constants shared by the main and prepare tsdown configs.
 * @module
 */

/** Loader module-table id handed to `window.__ModuleLoader__.load`. */
export const CLIENT_ID = 'dsh-tps'

/** Browser-safe externals resolved from the loader module table. */
export const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]
