// Pure live-TPS derivation for the running-turn status badge. The rate
// rides a rolling window of estimated-token samples over the streaming
// partial (the snapshot carries no live token counts); the settled
// window averages are already a built-in StatsLine feature, so this plugin
// deliberately owns only the instantaneous rate. Nothing here touches
// React, the wire, or the session log.

/** Rolling window for live-rate samples. */
export const LIVE_WINDOW_MS = 5_000
/** Sample age beyond which the live rate reads as stale (stream paused). */
export const LIVE_STALE_MS = 1_500
/** Floor for the rate denominator so one fast sample does not explode the rate. */
export const LIVE_MIN_DURATION_MS = 1_000

/** One live-rate sample: estimated output tokens produced at a wall-clock instant. */
export interface TpsSample {
  /** Unix epoch ms when the sampled tokens landed. */
  at: number
  /** Estimated output tokens produced since the previous sample. */
  tokens: number
}

/**
 * Approximate the output tokens of one text/reasoning delta: the oc-tps
 * bytes/5 estimate. This is the FALLBACK path only — TpsOverlay runs the
 * exact DeepSeek tokenizer (see ./tokenizer/estimator.ts) once its merge
 * table is loaded; these pure functions stay available for the brief
 * initialization window and are covered by the metric unit tests.
 * @param text - the delta text.
 * @returns the token estimate.
 */
export function estimateDeltaTokens(text: string): number {
  return Math.max(1, Math.ceil(new TextEncoder().encode(text).byteLength / 5))
}

/**
 * Estimated tokens of a partial assistant projection via the bytes/5
 * approximation (fallback; see `estimateDeltaTokens`). Text and reasoning
 * blocks only — tool-call frames carry arguments, not visible output.
 * @param blocks - the partial's assistant blocks.
 * @returns the estimate.
 */
export function estimatePartialTokens(blocks: readonly { kind: string; text?: string }[]): number {
  let total = 0
  for (const block of blocks) {
    if (block.kind === 'text' || block.kind === 'reasoning') {
      total += estimateDeltaTokens(block.text ?? '')
    }
  }
  return total
}

/**
 * Append one sample, pruning entries that fell out of the window.
 * @param samples - the current window, oldest first.
 * @param sample - the new sample.
 * @returns the next window (a new array; the input stays untouched).
 */
export function pushSample(samples: readonly TpsSample[], sample: TpsSample): TpsSample[] {
  return [...samples.filter(prev => sample.at - prev.at <= LIVE_WINDOW_MS), sample]
}

/**
 * Live tokens/sec over the rolling window, computed at `now`. Null while no
 * sample is fresh enough (the stream is paused or has not produced yet) —
 * a stale reading must never masquerade as a live rate.
 * @param samples - the current window, oldest first.
 * @param now - evaluation instant (Unix epoch ms).
 * @returns the rate, or null when stale/empty.
 */
export function liveRate(samples: readonly TpsSample[], now: number): number | null {
  if (samples.length === 0) return null
  const last = samples[samples.length - 1]
  if (last === undefined || now - last.at > LIVE_STALE_MS) return null
  const relevant = samples.filter(sample => now - sample.at <= LIVE_WINDOW_MS)
  if (relevant.length === 0) return null
  const first = relevant[0]
  const lastRelevant = relevant[relevant.length - 1]
  if (first === undefined || lastRelevant === undefined) return null
  const durationMs = Math.max(lastRelevant.at - first.at, LIVE_MIN_DURATION_MS)
  const totalTokens = relevant.reduce((sum, sample) => sum + sample.tokens, 0)
  return totalTokens / (durationMs / 1_000)
}

/**
 * Compact rate label: integer from 100, one decimal from 10, two below
 * (the oc-tps display convention).
 * @param value - tokens per second.
 * @returns the label.
 */
export function formatRate(value: number): string {
  if (value >= 100) return String(Math.round(value))
  if (value >= 10) return value.toFixed(1)
  return value.toFixed(2)
}
