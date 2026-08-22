// TPS badge: live tokens-per-second rendered inside the running-turn status
// row ("Deep diving…"), sharing that row's visibility lifecycle — the row
// exists only while a turn runs, so the badge disappears with it when the
// turn ends or a takeover panel hides the composer flow. The live rate
// rides a rolling window of token samples over the streaming partial
// (counted by the shared DeepSeek tokenizer estimator; the oc-tps bytes/5
// approximation covers the brief pre-load window); settled averages are the
// built-in StatsLine's job, not this plugin's. A hover dwell fades the
// badge out (click-through while hidden) and a pause restores it; a restore
// while the cursor still rests on the badge does not restart the dwell —
// the timer begins only after the cursor leaves and re-enters.

import { memo, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { sharedEstimator } from './tokenizer/estimator.ts'
import {
  formatRate, liveRate, pushSample, type TpsSample,
} from './tps-metrics.ts'
import css from './TpsOverlay.module.css'

/** Hover dwell before the badge starts fading (ms). */
const HIDE_DWELL_MS = 2_000
/** Fade transition duration (ms) — the CSS transition in TpsOverlay.module.css. */
const FADE_MS = 300
/** Grace period (ms) between the cursor leaving the badge area and the restore. */
const HIDE_RESTORE_MS = 3_000
/** Cursor margin (px) around the badge counted as "on the badge" while hidden. */
const HIDE_AREA_PADDING = 8
/** Staleness re-evaluation cadence while a turn is running (ms). */
const LIVE_TICK_MS = 1_000

/** Badge visibility lifecycle: shown → fading (hover dwell) → hidden (click-through) → shown (restore). */
export type BadgePhase = 'shown' | 'fading' | 'hidden'

/** Props: the conversation-snapshot selector plus the locale seat. */
export interface TpsOverlayProps {
  useSession: SnapshotSelectorHook<ConversationSnapshot>
  /** The badge's locale seat (the plugin's `tps` namespace). */
  t: PropsLocale<'tps'>['t']
}

/** A 2D point (client coordinates) and a rectangle (client geometry). */
export interface Point { x: number; y: number }
export interface Rect { left: number; top: number; right: number; bottom: number }

/**
 * Whether a point falls inside a rectangle, inclusive of the edges.
 * @param point - the point.
 * @param rect - the rectangle.
 * @returns true when the point is inside.
 */
export function pointInRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
}

export const TpsOverlay = memo(function TpsOverlay({ useSession, t }: TpsOverlayProps) {
  const running = useSession(s => s.running)
  const partial = useSession(s => s.partial)

  // Live-rate sampling: the effect runs per partial publication (the runtime
  // publishes the partial on every visible delta). Each delta appends an
  // estimated-token sample (exact DeepSeek tokenizer counts once the merge
  // table is loaded; the oc-tps bytes/5 approximation before that); a step
  // boundary restarts the window (the new step's observed content opens it,
  // so a fresh stream shows a rate from its first chunk instead of a blank
  // until the second delta).
  const samplesRef = useRef<TpsSample[]>([])
  const stepKeyRef = useRef<string | null>(null)
  const lastTokensRef = useRef(0)
  const [live, setLive] = useState<number | null>(null)
  // Re-evaluate once after the tokenizer table is ready so the first exact
  // count lands without waiting for the next stream delta.
  const [readyTick, setReadyTick] = useState(0)
  useEffect(() => {
    let alive = true
    void sharedEstimator.ready.then(() => {
      if (alive) setReadyTick(tick => tick + 1)
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!running || partial === null) {
      samplesRef.current = []
      stepKeyRef.current = null
      lastTokensRef.current = 0
      sharedEstimator.reset()
      setLive(null)
      return
    }
    const stepKey = `${partial.turn}:${partial.step}`
    const total = sharedEstimator.estimateBlocks(partial.blocks)
    if (stepKey !== stepKeyRef.current) {
      stepKeyRef.current = stepKey
      lastTokensRef.current = total
      samplesRef.current = total > 0 ? pushSample([], { at: Date.now(), tokens: total }) : []
      setLive(total > 0 ? liveRate(samplesRef.current, Date.now()) : null)
      return
    }
    const delta = Math.max(0, total - lastTokensRef.current)
    lastTokensRef.current = total
    if (delta > 0) {
      samplesRef.current = pushSample(samplesRef.current, { at: Date.now(), tokens: delta })
    }
    setLive(liveRate(samplesRef.current, Date.now()))
  }, [running, partial, readyTick])

  // While a turn runs, re-evaluate the live rate on a cadence so a paused
  // stream ages to null instead of freezing the last reading.
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      setLive(samplesRef.current.length > 0 ? liveRate(samplesRef.current, Date.now()) : null)
    }, LIVE_TICK_MS)
    return () => { window.clearInterval(timer) }
  }, [running])

  // First appearance: the badge stays unmounted until the first live value
  // arrives, so a fresh turn never shows a bare "TPS --" beside "Deep
  // diving…" (the mount also runs the fade-in animation). Mid-turn pauses
  // keep the dash — everShownValue is per mount, i.e. per turn row.
  const everShownValueRef = useRef(false)
  useEffect(() => {
    if (live !== null) everShownValueRef.current = true
  }, [live])

  // Hover-fade lifecycle: dwelling on the badge fades it out (the hidden
  // class drops pointer events, so the cursor passes through to whatever is
  // underneath). While hidden the badge stays hidden for as long as the
  // cursor remains on or near its area; once the cursor moves away, a short
  // grace period elapses before it restores — long enough to copy nearby
  // text without the badge popping back under the cursor — and the restore
  // is cancelled if the cursor returns to the badge area meanwhile. Driven
  // by the window mousemove listener (the badge itself cannot see pointer
  // events while hidden). Because the restore only ever happens with the
  // cursor already outside, no synthetic enter can restart the dwell, and a
  // parked cursor can never loop the cycle. Leaving during the dwell or the
  // fade cancels the cycle.
  const badgeRef = useRef<HTMLSpanElement | null>(null)
  const mousePosRef = useRef<Point | null>(null)
  const phaseRef = useRef<BadgePhase>('shown')
  const [phase, setPhase] = useState<BadgePhase>('shown')
  const dwellRef = useRef<number>(0)
  const fadeRef = useRef<number>(0)
  const restoreRef = useRef<number>(0)

  const updatePhase = (next: BadgePhase): void => {
    phaseRef.current = next
    setPhase(next)
  }

  useEffect(() => {
    const onMove = (event: MouseEvent): void => {
      mousePosRef.current = { x: event.clientX, y: event.clientY }
      if (phaseRef.current !== 'hidden') return
      const badge = badgeRef.current
      const pos = mousePosRef.current
      if (badge === null || pos === null) return
      const rect = badge.getBoundingClientRect()
      const inside = pointInRect(pos, {
        left: rect.left - HIDE_AREA_PADDING,
        top: rect.top - HIDE_AREA_PADDING,
        right: rect.right + HIDE_AREA_PADDING,
        bottom: rect.bottom + HIDE_AREA_PADDING,
      })
      if (inside) {
        // Back on or near the badge: cancel any pending restore.
        window.clearTimeout(restoreRef.current)
        restoreRef.current = 0
      } else if (restoreRef.current === 0) {
        // Left the area: start the delayed restore (one timer only).
        restoreRef.current = window.setTimeout(() => {
          restoreRef.current = 0
          window.clearTimeout(dwellRef.current)
          window.clearTimeout(fadeRef.current)
          updatePhase('shown')
        }, HIDE_RESTORE_MS)
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.clearTimeout(dwellRef.current)
      window.clearTimeout(fadeRef.current)
      window.clearTimeout(restoreRef.current)
    }
  }, [])

  const onMouseEnter = (): void => {
    if (phase !== 'shown') return
    dwellRef.current = window.setTimeout(() => {
      updatePhase('fading')
      fadeRef.current = window.setTimeout(() => {
        updatePhase('hidden')
      }, FADE_MS)
    }, HIDE_DWELL_MS)
  }

  const onMouseLeave = (): void => {
    window.clearTimeout(dwellRef.current)
    window.clearTimeout(fadeRef.current)
    if (phase === 'fading') updatePhase('shown')
  }

  const liveText = live === null ? t('dash') : formatRate(live)
  // Wait for the first value before mounting (see everShownValueRef above).
  if (live === null && !everShownValueRef.current) return null
  return (
    <span
      ref={badgeRef}
      className={clsx(
        css.root,
        css.enter,
        phase === 'fading' && css.fading,
        phase === 'hidden' && css.hidden,
      )}
      data-tps-badge=""
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {t('display', { live: liveText })}
    </span>
  )
})
