/**
 * Development build config: `tsc -b` has already emitted `lib/types` through
 * the sibling rc.1 harness project graph; tsdown bundles the node half
 * (`lib/index.js`) and the browser client bundle (`lib/client.js`) straight
 * from src, with CSS Modules compiled by lightningcss and inlined as a
 * `<style data-plugin>` tag — the same artifact contract as the in-repo
 * dsh-client-* packages.
 */
import { defineConfig } from 'tsdown'
import { cssModulesPlugin } from './build/css-modules-plugin.ts'
import { CLIENT_EXTERNALS, CLIENT_ID } from './build/shared.ts'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    clean: false,
    dts: false,
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    clean: false,
    dts: false,
    sourcemap: true,
    // clsx MUST be bundled: the web module table does not provide it (only
    // CLIENT_EXTERNALS are shared), and a leftover require('clsx') fails the
    // whole client plugin at load. Keep every new runtime dependency either
    // here or in CLIENT_EXTERNALS — never plain-external.
    deps: { alwaysBundle: ['clsx'], neverBundle: CLIENT_EXTERNALS },
    plugins: [cssModulesPlugin(CLIENT_ID)],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
