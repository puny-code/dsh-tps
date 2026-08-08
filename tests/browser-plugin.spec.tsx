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
  it('renders nothing until the first live value, then keeps the dash during mid-turn pauses', () => {
    let snapshot = conversationSnapshot()
    const view = render(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    // First appearance waits for a value: no bare "TPS --" next to the row.
    expect(view.container.firstChild).toBeNull()

    // The first value arrives → the badge mounts with the value.
    snapshot = runningSnapshot()
    view.rerender(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    expect(view.container.textContent).toContain('TPS 3.00')

    // A mid-turn pause shows the dash (and value recovery shows the number
    // again without remounting).
    snapshot = { ...snapshot, partial: null }
    view.rerender(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    expect(view.container.textContent).toContain('TPS --')
    snapshot = runningSnapshot()
    view.rerender(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    expect(view.container.textContent).toContain('TPS 3.00')
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

  it('fades out after the hover dwell and stays hidden while the cursor stays on it', async () => {
    vi.useFakeTimers()
    mockBadgeRect({ left: 0, top: 0, right: 100, bottom: 30 })
    const snapshot = runningSnapshot()
    const view = render(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    const badge = view.container.querySelector('[data-tps-badge]')
    expect(badge).not.toBeNull()
    expect(badge!.className).toContain(css.root)
    expect(badge!.className).not.toContain(css.hidden)

    // The cursor moves onto the badge, then dwells it into the hidden state.
    fireEvent.mouseMove(window, { clientX: 50, clientY: 15 })
    fireEvent.mouseEnter(badge!)
    await act(async () => { vi.advanceTimersByTime(2_000) })
    expect(badge!.className).toContain(css.fading)
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(badge!.className).toContain(css.hidden)

    // A parked cursor keeps it hidden: no auto-restore, no re-fade cycle.
    await act(async () => { vi.advanceTimersByTime(5_000) })
    expect(badge!.className).toContain(css.hidden)
    expect(badge!.className).not.toContain(css.fading)

    // The cursor leaves the badge area: the restore waits the grace period
    // (copying nearby text must not be interrupted by a popping badge).
    fireEvent.mouseMove(window, { clientX: 200, clientY: 15 })
    await act(async () => { vi.advanceTimersByTime(1_000) })
    expect(badge!.className).toContain(css.hidden)
    await act(async () => { vi.advanceTimersByTime(2_000) })
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

  it('restores only after the cursor leaves the badge area, and re-hovering restarts the dwell', async () => {
    vi.useFakeTimers()
    mockBadgeRect({ left: 0, top: 0, right: 100, bottom: 30 })
    const snapshot = runningSnapshot()
    const view = render(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    const badge = view.container.querySelector('[data-tps-badge]')!

    // Dwell the badge into the hidden state with the cursor parked on it.
    fireEvent.mouseMove(window, { clientX: 50, clientY: 15 })
    fireEvent.mouseEnter(badge)
    await act(async () => { vi.advanceTimersByTime(2_300) })
    expect(badge.className).toContain(css.hidden)

    // A parked cursor never restarts the cycle on its own.
    await act(async () => { vi.advanceTimersByTime(5_000) })
    expect(badge.className).toContain(css.hidden)

    // The cursor leaves the badge area: the restore waits the 3s grace
    // period, and because the cursor is outside when it lands, no synthetic
    // enter can restart the dwell.
    fireEvent.mouseMove(window, { clientX: 200, clientY: 15 })
    await act(async () => { vi.advanceTimersByTime(2_000) })
    expect(badge.className).toContain(css.hidden)
    await act(async () => { vi.advanceTimersByTime(1_000) })
    expect(badge.className).not.toContain(css.hidden)
    await act(async () => { vi.advanceTimersByTime(2_500) })
    expect(badge.className).not.toContain(css.fading)
    expect(badge.className).not.toContain(css.hidden)

    // Moving back onto the badge and hovering starts the timer normally.
    fireEvent.mouseMove(window, { clientX: 50, clientY: 15 })
    fireEvent.mouseEnter(badge)
    await act(async () => { vi.advanceTimersByTime(2_000) })
    expect(badge.className).toContain(css.fading)
  })

  it('stays hidden while the cursor is near the badge and restores after it leaves the padded area', async () => {
    vi.useFakeTimers()
    // Badge rect {0,0,100,30}; the padded hide area extends 8px beyond it.
    mockBadgeRect({ left: 0, top: 0, right: 100, bottom: 30 })
    const snapshot = runningSnapshot()
    const view = render(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    const badge = view.container.querySelector('[data-tps-badge]')!

    fireEvent.mouseMove(window, { clientX: 50, clientY: 15 })
    fireEvent.mouseEnter(badge)
    await act(async () => { vi.advanceTimersByTime(2_300) })
    expect(badge.className).toContain(css.hidden)

    // Cursor near the badge: outside the rect (x=106 > right=100) but inside
    // the padded area (right=108) → still hidden.
    fireEvent.mouseMove(window, { clientX: 106, clientY: 15 })
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(badge.className).toContain(css.hidden)

    // Cursor leaves the padded area (x=120 > 108): still hidden during the
    // grace period, then restores.
    fireEvent.mouseMove(window, { clientX: 120, clientY: 15 })
    await act(async () => { vi.advanceTimersByTime(2_000) })
    expect(badge.className).toContain(css.hidden)
    await act(async () => { vi.advanceTimersByTime(1_000) })
    expect(badge.className).not.toContain(css.hidden)
  })

  it('a return to the badge area during the grace period cancels the pending restore', async () => {
    vi.useFakeTimers()
    mockBadgeRect({ left: 0, top: 0, right: 100, bottom: 30 })
    const snapshot = runningSnapshot()
    const view = render(<TpsOverlay useSession={useSessionOf(() => snapshot)} t={t} />)
    const badge = view.container.querySelector('[data-tps-badge]')!

    fireEvent.mouseMove(window, { clientX: 50, clientY: 15 })
    fireEvent.mouseEnter(badge)
    await act(async () => { vi.advanceTimersByTime(2_300) })
    expect(badge.className).toContain(css.hidden)

    // Leave the area (starts the 3s grace timer), then come back near it
    // before the timer fires: the restore is cancelled, still hidden.
    fireEvent.mouseMove(window, { clientX: 200, clientY: 15 })
    await act(async () => { vi.advanceTimersByTime(1_000) })
    fireEvent.mouseMove(window, { clientX: 106, clientY: 15 }) // inside the 8px margin
    await act(async () => { vi.advanceTimersByTime(3_000) })
    expect(badge.className).toContain(css.hidden)

    // Leaving again restarts the grace period and restores after it.
    fireEvent.mouseMove(window, { clientX: 200, clientY: 15 })
    await act(async () => { vi.advanceTimersByTime(3_000) })
    expect(badge.className).not.toContain(css.hidden)
  })

  it('the node apply is an inert loader seat', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
