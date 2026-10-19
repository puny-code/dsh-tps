// @vitest-environment jsdom
/**
 * Mount-seat contract for the running-turn status row. DSH 0.1.x rendered the
 * row itself as `[role="status"][aria-live="polite"]`; 0.2.x nests it inside
 * `div[data-chat-running]` as a visually hidden status span, the divider, and
 * the visible content span last. The badge must ride that visible span so it
 * renders inline with the "Deep diving…" copy, and it must follow the row when
 * the host replaces the row between steps.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { TpsMount } from '../src/client/TpsMount.tsx'
import { sharedEstimator } from '../src/client/tokenizer/estimator.ts'

afterEach(() => {
  cleanup()
})

beforeAll(async () => {
  // Exact tokenizer counts are async; the badge needs a positive estimate.
  await sharedEstimator.ready
})

/** One streaming text partial, i.e. a visible live-rate sample. */
const partial = { turn: 1, step: 0, blocks: [{ kind: 'text', text: 'streaming text' }] }

/** Selector-faithful Session stub: the mount and the badge read `running`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useSessionOf = (running: boolean): any => (selector: any) => selector({ running })

/** Selector-faithful Chat stub: the badge reads `legacy.partial`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useChatOf = (value: typeof partial | null): any => (selector: any) => selector({ legacy: { partial: value } })

/** Locale stub mirroring the plugin's `display` copy. */
const t = (key: string, params?: Record<string, unknown>): string =>
  params !== undefined && 'live' in params ? `TPS ${String(params.live)}` : key

/** The dock entry, mounted outside the conversation column, as the real slot does. */
function mount(running = true) {
  return <TpsMount sessionId="one" useSession={useSessionOf(running)} useChat={useChatOf(partial)} t={t} />
}

describe('running-row seat (DSH 0.2.x shape)', () => {
  it('renders the badge inside the visible content span, not the hidden status span', async () => {
    const view = render(<div data-conversation-scroll="">
      <div data-chat-flow="">
        <div data-chat-running="" className="xz4KEq_running">
          <span role="status" aria-live="polite" aria-atomic="true" className="acc_hidden">Deep diving</span>
          <span className="xz4KEq_runningDivider" aria-hidden="true" />
          <span className="xz4KEq_runningContent">Deep diving…</span>
        </div>
      </div>
      {mount()}
    </div>)
    const row = view.container.querySelector('[data-chat-running]')!
    const status = row.children[0]!
    const divider = row.children[1]!
    const content = row.querySelector('.xz4KEq_runningContent')!

    const container = content.querySelector('[data-tps-mount]')
    expect(container).not.toBeNull()
    expect(content.lastChild).toBe(container)
    expect(status.querySelector('[data-tps-mount]')).toBeNull()
    expect(divider.querySelector('[data-tps-mount]')).toBeNull()

    await waitFor(() => { expect(content.querySelector('[data-tps-badge]')).not.toBeNull() })
    expect(status.querySelector('[data-tps-badge]')).toBeNull()
  })

  it('moves the badge to the replacement row between steps', async () => {
    const view = render(<div data-conversation-scroll="">
      <div data-chat-flow="">
        <div data-chat-running="" className="xz4KEq_running">
          <span role="status" aria-live="polite" className="acc_hidden">Deep diving</span>
          <span className="xz4KEq_runningDivider" aria-hidden="true" />
          <span className="xz4KEq_runningContent">Deep diving…</span>
        </div>
      </div>
      {mount()}
    </div>)
    const oldRow = view.container.querySelector('[data-chat-running]')!
    const flow = view.container.querySelector('[data-chat-flow]')!
    await waitFor(() => { expect(oldRow.querySelector('[data-tps-badge]')).not.toBeNull() })

    const nextRow = document.createElement('div')
    nextRow.setAttribute('data-chat-running', '')
    const nextContent = document.createElement('span')
    nextContent.className = 'xz4KEq_runningContent'
    nextContent.textContent = 'Deep diving for 12s…'
    nextRow.append(Object.assign(document.createElement('span'), {
      textContent: 'Deep diving', role: 'status', className: 'acc_hidden',
    }), nextContent)
    await act(async () => { oldRow.replaceWith(nextRow) })

    await waitFor(() => { expect(nextContent.querySelector('[data-tps-badge]')).not.toBeNull() })
    expect(oldRow.querySelector('[data-tps-mount]')).toBeNull()
    expect(flow.contains(nextRow)).toBe(true)
  })

  it('falls back to the last visible span when the content class token is absent', () => {
    const view = render(<div data-conversation-scroll="">
      <div data-chat-flow="">
        <div data-chat-running="">
          <span role="status" aria-live="polite">Deep diving</span>
          <span aria-hidden="true" />
          <span>Deep diving…</span>
        </div>
      </div>
      {mount()}
    </div>)
    const row = view.container.querySelector('[data-chat-running]')!
    const visible = row.children[2]!
    expect(visible.querySelector('[data-tps-mount]')).not.toBeNull()
    expect(row.children[0]!.querySelector('[data-tps-mount]')).toBeNull()
  })
})

describe('running-row seat (DSH 0.1.x shape)', () => {
  it('still mounts into a direct role=status row', () => {
    const view = render(<div data-conversation-scroll="">
      <div data-chat-flow="">
        <div role="status" aria-live="polite">考え中…</div>
      </div>
      {mount()}
    </div>)
    const row = view.container.querySelector('[role="status"]')!
    expect(row.querySelector('[data-tps-mount]')).not.toBeNull()
  })
})
