/**
 * Build-time constants shared by the main and prepare tsdown configs.
 * @module
 */

/** Loader module-table id handed to `window.__ModuleLoader__.load`. */
export const CLIENT_ID = 'dsh-tps'

/** Browser-safe externals resolved from the loader module table. */
export const CLIENT_EXTERNALS = [
  'cordis',
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-slots',
]
