/**
 * Consumer-side build for git installs (the `prepare` script): transpile
 * straight from src without tsc project references, which need the sibling
 * harness checkout that only dev machines and CI have. Types are NOT checked
 * here — `pnpm run typecheck` owns that.
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
    tsconfig: 'tsconfig.prepare.json',
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
    deps: { alwaysBundle: ['clsx'], neverBundle: CLIENT_EXTERNALS },
    plugins: [cssModulesPlugin(CLIENT_ID)],
    tsconfig: 'tsconfig.prepare.json',
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
