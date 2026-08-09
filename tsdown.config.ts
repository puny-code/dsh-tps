/**
 * Standalone build config: `tsc -b` has already emitted `lib/types` (JS +
 * d.ts); tsdown bundles the node half (`lib/index.js`) and the browser
 * client bundle (`lib/client.js`) handed to `window.__ModuleLoader__.load`,
 * with CSS Modules compiled by lightningcss and inlined as a
 * `<style data-plugin>` tag — the same artifact contract as the in-repo
 * dsh-client-* packages.
 */
import { defineConfig } from 'tsdown'
import { cssModulesPlugin } from './build/css-modules-plugin.ts'
import { CLIENT_EXTERNALS, CLIENT_ID } from './build/shared.ts'

export default defineConfig([
  {
    entry: ['lib/types/index.js'],
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    clean: false,
    dts: false,
  },
  {
    entry: { client: 'lib/types/client/index.js' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    clean: false,
    dts: false,
    sourcemap: true,
    deps: { neverBundle: CLIENT_EXTERNALS },
    plugins: [cssModulesPlugin(CLIENT_ID)],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
