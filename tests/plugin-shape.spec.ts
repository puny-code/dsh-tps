import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import * as tps from '../src/index.ts'
import * as client from '../src/client/index.ts'
import pkg from '../package.json'

/**
 * Real Loader export-path guard for the namespace TPS plugin: the node half
 * must survive the host Loader's unwrap step, and the browser half must
 * declare the inject/services contract the client-modules host scans.
 */
describe('dsh-tps plugin export shape', () => {
  it('node half preserves apply through Loader unwrapping', () => {
    expect('default' in tps).toBe(false)
    expect(typeof tps.apply).toBe('function')

    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(tps) as Record<string, unknown>
    expect(unwrapped).toBe(tps)
    expect(typeof unwrapped.apply).toBe('function')
  })

  it('browser half exports apply and the slots/locale inject contract', () => {
    expect('default' in client).toBe(false)
    expect(typeof client.apply).toBe('function')
    expect(client.inject).toEqual(['slots', 'locale'])
  })

  it('package.json declares the web client entry the host scans', () => {
    const meta = pkg.dsh.client as { platform: string; inject: string[] }
    expect(meta.platform).toBe('web')
    expect(meta.inject).toContain('@deepseek-ai/dsh-client-ui-conversation')
    expect(meta.inject).toContain('@deepseek-ai/dsh-client-ui-renderer')
    // The bundle layer that activates this plugin ships the slot host.
    expect((pkg.dsh as { bundle: { patch: string } }).bundle.patch).toBe('./cordis.yml')
  })

  it('built client bundle never requires a package the module table lacks', () => {
    // The vitest suite runs against src, so this check is skipped until a
    // build has produced the artifact — run `pnpm run build` first.
    const bundlePath = new URL('../lib/client.js', import.meta.url)
    if (!existsSync(bundlePath)) return
    // Module-table ids shared by the web shell (mirror of CLIENT_EXTERNALS
    // plus jsx-runtime); anything else must be inlined by tsdown
    // (alwaysBundle), or the whole client plugin fails at load.
    const allowed = new Set([
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-store',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives',
    ])
    const bundle = readFileSync(bundlePath, 'utf8')
    const requires = new Set(
      [...bundle.matchAll(/require\((["'])([^"']+)\1\)/g)].map(m => m[2]!),
    )
    const stray = [...requires].filter(id => !allowed.has(id))
    expect(stray).toEqual([])
  })
})
