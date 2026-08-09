import { describe, expect, it } from 'vitest'
import Loader from '@cordisjs/plugin-loader'
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
    const meta = pkg.dshClient as { platform: string; inject: string[] }
    expect(meta.platform).toBe('web')
    expect(meta.inject).toContain('@deepseek-ai/dsh-client-ui-conversation')
    // The bundle layer that activates this plugin ships the slot host.
    expect((pkg.dsh as { bundle: { patch: string } }).bundle.patch).toBe('./cordis.yml')
  })
})
