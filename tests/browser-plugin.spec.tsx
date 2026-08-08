// @vitest-environment jsdom
/**
 * dsh-tps standalone tests: the plugin registers the TpsOverlay entry at
 * conversation.chat.turnStatus (verified against the pure SlotCore registry —
 * the standalone build avoids the harness SlotTestRuntime deep-import chain),
 * the hover-fade lifecycle fades the badge out after the dwell and restores
 * it after the pause (click-through while hidden), and a restore while the
 * cursor still rests on the badge does not restart the dwell (leave-and-
 * re-enter required). Component-level rendering covers the direct props
 * contract. The node half is exercised over the same suite.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { ConversationSnapshot } from '../../deepseek-harness/packages/client/runtime/src/client'
import type { SnapshotSelectorHook } from '../../deepseek-harness/packages/client/ui-slots/src'
import { SlotCore } from '../../deepseek-harness/packages/client/ui-slots/src'
import { apply, inject } from '../src/client/index.ts'
import { TpsOverlay, pointInRect } from '../src/client/TpsOverlay.tsx'
import { zh } from '../src/client/locales.ts'
import css from '../src/client/TpsOverlay.module.css'
import { apply as nodeApply } from '../src/index.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const sid = 's1' as ConversationSnapshot['sessionId']

/** A quiescent conversation snapshot (open window, no traffic). */
function conversationSnapshot(): ConversationSnapshot {
  return {
    sessionId: sid,
    nodes: [],
    turnTimings: new Map(),
    turnEnds: new Map(),
    partial: null,
    runningCalls: [],
    pending: [],
    queue: [],
    running: false,
    subagent: null,
    composerPhase: 'active',
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: false,
    loadingOlder: false,
    promptError: null,
    blank: false,
    lastAgentError: null,
  }
}

/** A session that is mid-stream with one text partial. */
function runningSnapshot(): ConversationSnapshot {
  return {
    ...conversationSnapshot(),
    running: true,
    partial: { turn: 1, step: 0, blocks: [{ kind: 'text', text: 'streaming text' }] },
  }
}

/** Selector-faithful useSession stub: applies the selector to a live snapshot cell. */
function useSessionOf(snapshot: () => ConversationSnapshot): SnapshotSelectorHook<ConversationSnapshot> {
  return selector => selector(snapshot())
}

/** Make the badge report a non-empty client rect (jsdom returns all-zero). */
function mockBadgeRect(rect: { left: number; top: number; right: number; bottom: number }): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect as DOMRect)
}

/** Translate stub over the plugin dictionary (key fallback like LocaleService). */
function makeTranslate(dict: Record<string, string>): (key: string, params?: Record<string, unknown>) => string {
  return (key, params) => {
    const template = dict[key] ?? key
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match)
  }
}

const t = makeTranslate(zh)

describe('pointInRect', () => {
  it('includes points on the edges and excludes outside points', () => {
    const rect = { left: 10, top: 20, right: 110, bottom: 50 }
    expect(pointInRect({ x: 10, y: 20 }, rect)).toBe(true)
    expect(pointInRect({ x: 110, y: 50 }, rect)).toBe(true)
    expect(pointInRect({ x: 60, y: 35 }, rect)).toBe(true)
    expect(pointInRect({ x: 9, y: 35 }, rect)).toBe(false)
    expect(pointInRect({ x: 60, y: 51 }, rect)).toBe(false)
  })
})

describe('ui-tps plugin registration', () => {
  it('registers the turn-status entry once the slot is declared', () => {
    const core = new SlotCore()
    // The built-in root declares the slot (declaring is claiming).
    core.register(
      { name: 'root', children: { 'conversation.chat.turnStatus': { kind: 'single', scope: 'session' } } },
      (() => null) as never,
    )
    core.register({ name: 'conversation.chat.turnStatus', locale: 'tps' }, TpsOverlay)
    const entries = core.entries('conversation.chat.turnStatus')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.locale).toBe('tps')
    expect(entries[0]?.component).toBe(TpsOverlay)
  })

  it('declared plugin surface matches the apply contract', () => {
    expect(inject).toEqual(['slots', 'locale'])
    expect(typeof apply).toBe('function')
  })

  it('drops the turn-status entry when the registration disposes (HMR safety)', () => {
    const core = new SlotCore()
    core.register(
      { name: 'root', children: { 'conversation.chat.turnStatus': { kind: 'single', scope: 'session' } } },
      (() => null) as never,
    )
    const dispose = core.register({ name: 'conversation.chat.turnStatus', locale: 'tps' }, TpsOverlay)
    expect(core.entries('conversation.chat.turnStatus')).toHaveLength(1)
    dispose()
    expect(core.entries('conversation.chat.turnStatus')).toHaveLength(0)
  })
})

describe('TpsOverlay component', () => {
  it('renders a dash while the stream has no output yet', () => {
    const view = render(<TpsOverlay useSession={useSessionOf(() => conversationSnapshot())} t={t} />)
    expect(view.container.textContent).toContain('TPS --')
  })

  it('samples the streaming partial into a live rate and refreshes on deltas', async () => {
    vi.useFakeTimers()
    let snapshot = runningSnapshot()
    const view = render(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    expect(view.container.textContent).toContain('TPS 3.00')

    // A delta lands at t=2000: one more estimated token over a 2s span.
    snapshot = {
      ...snapshot,
      partial: { turn: 1, step: 0, blocks: [{ kind: 'text', text: 'streaming text more' }] },
    }
    await act(async () => { vi.advanceTimersByTime(2_000) })
    view.rerender(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    // 3 tokens at t≈0 + 1 token at t=2000 → 4 / 2s = 2.00.
    expect(view.container.textContent).toContain('TPS 2.00')
  })

  it('resets the live base when the streaming step changes', async () => {
    vi.useFakeTimers()
    let snapshot = runningSnapshot()
    const view = render(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    expect(view.container.textContent).toContain('TPS 3.00')

    // A new step restarts accumulation: the previous step's samples drop and
    // the new step's observed content opens a fresh window.
    snapshot = {
      ...snapshot,
      partial: { turn: 1, step: 1, blocks: [{ kind: 'text', text: 'x'.repeat(100) }] },
    }
    view.rerender(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    expect(view.container.textContent).toContain('TPS 20.0') // 100 bytes → 20 tokens

    // The next delta of the new step appends: 5 more bytes → 1 token.
    snapshot = {
      ...snapshot,
      partial: { turn: 1, step: 1, blocks: [{ kind: 'text', text: 'x'.repeat(105) }] },
    }
    await act(async () => { vi.advanceTimersByTime(500) })
    view.rerender(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    // 20 tokens at t≈0 + 1 at t=500 → 21 over the 1s floor.
    expect(view.container.textContent).toContain('TPS 21.0')
  })

  it('ages the live rate to a dash while the stream pauses', async () => {
    vi.useFakeTimers()
    const snapshot = runningSnapshot()
    const view = render(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    expect(view.container.textContent).toContain('TPS 3.00')

    // No new deltas: the cadence tick ages the sample past LIVE_STALE_MS.
    await act(async () => { vi.advanceTimersByTime(2_000) })
    expect(view.container.textContent).toContain('TPS --')
  })

  it('fades out after the hover dwell and restores after the pause', async () => {
    vi.useFakeTimers()
    const snapshot = runningSnapshot()
    const view = render(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    const badge = view.container.querySelector('[data-tps-badge]')
    expect(badge).not.toBeNull()
    expect(badge!.className).toContain(css.root)
    expect(badge!.className).not.toContain(css.hidden)

    // Dwelling on the badge fades it, then hides it (click-through).
    fireEvent.mouseEnter(badge!)
    await act(async () => { vi.advanceTimersByTime(2_000) })
    expect(badge!.className).toContain(css.fading)
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(badge!.className).toContain(css.hidden)

    // The restore pause brings it back.
    await act(async () => { vi.advanceTimersByTime(3_000) })
    expect(badge!.className).not.toContain(css.hidden)
  })

  it('leaving during the dwell cancels the fade', async () => {
    vi.useFakeTimers()
    const snapshot = runningSnapshot()
    const view = render(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    const badge = view.container.querySelector('[data-tps-badge]')!

    fireEvent.mouseEnter(badge)
    await act(async () => { vi.advanceTimersByTime(1_000) })
    fireEvent.mouseLeave(badge)
    await act(async () => { vi.advanceTimersByTime(5_000) })
    expect(badge.className).not.toContain(css.fading)
    expect(badge.className).not.toContain(css.hidden)
  })

  it('a restore with the cursor still on the badge does not restart the dwell until leave-and-re-enter', async () => {
    vi.useFakeTimers()
    mockBadgeRect({ left: 0, top: 0, right: 100, bottom: 30 })
    const snapshot = runningSnapshot()
    const view = render(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    const badge = view.container.querySelector('[data-tps-badge]')!

    // Dwell the badge into the hidden state.
    fireEvent.mouseEnter(badge)
    await act(async () => { vi.advanceTimersByTime(2_300) })
    expect(badge.className).toContain(css.hidden)

    // The cursor sits on the badge area through the hidden pause.
    fireEvent.mouseMove(window, { clientX: 50, clientY: 15 })
    await act(async () => { vi.advanceTimersByTime(3_000) })
    expect(badge.className).not.toContain(css.hidden)

    // The restored badge must not start the dwell: long enough to fade if it had.
    await act(async () => { vi.advanceTimersByTime(2_500) })
    expect(badge.className).not.toContain(css.fading)
    expect(badge.className).not.toContain(css.hidden)

    // Leaving and re-entering starts the timer normally.
    fireEvent.mouseLeave(badge)
    fireEvent.mouseEnter(badge)
    await act(async () => { vi.advanceTimersByTime(2_000) })
    expect(badge.className).toContain(css.fading)
  })

  it('a restore under a drifted badge does not restart the dwell: the point-check miss is absorbed by the restore window', async () => {
    vi.useFakeTimers()
    // The badge sits at rect A while the cursor parks on it.
    mockBadgeRect({ left: 0, top: 0, right: 100, bottom: 30 })
    const snapshot = runningSnapshot()
    const view = render(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    const badge = view.container.querySelector('[data-tps-badge]')!

    // Dwell the badge into the hidden state.
    fireEvent.mouseEnter(badge)
    await act(async () => { vi.advanceTimersByTime(2_300) })
    expect(badge.className).toContain(css.hidden)

    // While hidden the status row drifts down: rect B no longer contains the
    // parked cursor (50,15), so the restore point check misses.
    mockBadgeRect({ left: 0, top: 50, right: 100, bottom: 80 })
    fireEvent.mouseMove(window, { clientX: 50, clientY: 15 })
    await act(async () => { vi.advanceTimersByTime(3_000) })
    expect(badge.className).not.toContain(css.hidden)

    // The restore's synthetic enter/leave pair arrives inside the window and
    // must be ignored — otherwise the parked cursor would restart the dwell.
    fireEvent.mouseLeave(badge)
    fireEvent.mouseEnter(badge)
    await act(async () => { vi.advanceTimersByTime(2_500) })
    expect(badge.className).not.toContain(css.fading)
    expect(badge.className).not.toContain(css.hidden)

    // After the window a real leave-and-re-enter starts the timer normally.
    fireEvent.mouseLeave(badge)
    fireEvent.mouseEnter(badge)
    await act(async () => { vi.advanceTimersByTime(2_000) })
    expect(badge.className).toContain(css.fading)
  })
})

describe('ui-tps node half', () => {
  it('the node apply is an inert loader seat', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
