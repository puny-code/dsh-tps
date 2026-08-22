// Incremental DeepSeek-token estimator for the streaming partial. The TPS
// badge sees every visible delta of the partial (the runtime publishes a new
// snapshot per delta and the estimator is re-run over the whole partial), so
// counting from scratch on every delta would re-encode the whole turn.
//
// The estimator keeps one slot per assistant block and exploits the locality
// of the pretokenizer: it is deterministic and its split regexes look forward
// greedily, so appending text can re-split only the LAST segment (new text
// may lengthen it, split it, or add segments after it — e.g. "12" + "34"
// re-splits to ["123", "4"]). Every earlier segment is byte-identical, so its
// BPE count is reusable; only the window `lastSegment + delta` is
// pretokenized and BPE-encoded again. Segments never merge across boundaries,
// so the sum over segments is exact.
//
// Note on the window: BPE merge order depends on the whole segment, so the
// extended last segment is re-encoded as a whole — an incremental merge state
// would drift from the official count (see bpe.ts). Costs stay small because
// segment lengths are small (words, number groups, punctuation).
//
// Before the merge table is ready (async decode), the estimator reports the
// previous oc-tps bytes/5 approximation so the badge never blocks; the next
// re-evaluation after ready switches to exact counts.
import { countSegmentTokens, countTextTokens } from './bpe.ts'
import { loadRankTable, type RankTable } from './merges.ts'
import { pretokenize } from './pretokenize.ts'
import { estimateDeltaTokens } from '../tps-metrics.ts'

/** Block shapes the estimator has seen (kind of the partial block). */
type EstimatorBlock = { kind: string; text?: string }

/** Fallback approximation (matches the pre-tokenizer plugin behavior). */
function approxTokens(text: string): number {
  return estimateDeltaTokens(text)
}

/** Per-block incremental state. */
interface SlotState {
  /** The block's kind, used to match slots to partial blocks. */
  kind: string
  /** Last seen full text (suffix-append guard and the fast path key). */
  text: string
  /** Tokens of every segment before the last one. */
  fixedTokens: number
  /** Text of the current last segment. */
  lastSegText: string
  /** Token count of the current last segment (a one-shot encode). */
  lastSegTokens: number
  /** Total tokens of the last encoded text. */
  total: number
}

/** One-shot BPE token count of one segment string. */
function countSegment(segment: string, table: RankTable): number {
  return countSegmentTokens(new TextEncoder().encode(segment), table)
}

/** Sum the one-shot token count of segments [from, until). */
function sumSegments(segments: readonly string[], from: number, until: number, table: RankTable): number {
  let total = 0
  for (let i = from; i < until; i++) {
    total += countSegment(segments[i] as string, table)
  }
  return total
}

/** Incremental estimator for one streaming block of text. */
class Slot {
  private state: SlotState | null = null
  private readonly table: RankTable

  constructor(table: RankTable) {
    this.table = table
  }

  /** Current token count (0 when no text seen yet). */
  get total(): number {
    return this.state?.total ?? 0
  }

  /**
   * Update with the block's newest text and return the cumulative token count.
   * @param kind - the block kind (text/reasoning; others stay at 0).
   * @param text - the block's current text.
   * @returns the cumulative tokens of the block.
   */
  update(kind: string, text: string): number {
    if (kind !== 'text' && kind !== 'reasoning') return 0
    if (text.length === 0) {
      this.state = null
      return 0
    }
    const prev = this.state
    if (prev !== null && prev.text === text) return prev.total
    if (prev === null || prev.kind !== kind || !text.startsWith(prev.text)) {
      return this.rebuild(kind, text)
    }
    const delta = text.slice(prev.text.length)
    const windowSegments = pretokenize(prev.lastSegText + delta)
    if (windowSegments.length === 0) return prev.total
    if (windowSegments.length === 1 && (windowSegments[0] as string).startsWith(prev.lastSegText)) {
      // The last segment just extended (or re-grouped within itself).
      prev.lastSegText = windowSegments[0] as string
      prev.lastSegTokens = countSegment(prev.lastSegText, this.table)
      prev.text = text
      prev.total = prev.fixedTokens + prev.lastSegTokens
      return prev.total
    }
    const lastIndex = windowSegments.length - 1
    const fixedTokens = (windowSegments[0] === prev.lastSegText)
      // Boundary held: the old last segment becomes a fixed prefix segment.
      ? prev.fixedTokens + prev.lastSegTokens + sumSegments(windowSegments, 1, lastIndex, this.table)
      // Re-split swallowed the old last segment: the whole window is re-assessed.
      : prev.fixedTokens + sumSegments(windowSegments, 0, lastIndex, this.table)
    const state: SlotState = {
      kind,
      text,
      fixedTokens,
      lastSegText: windowSegments[lastIndex] as string,
      lastSegTokens: countSegment(windowSegments[lastIndex] as string, this.table),
      total: 0,
    }
    state.total = state.fixedTokens + state.lastSegTokens
    this.state = state
    return state.total
  }

  /** Full re-encode (fresh content, mid-text edit, or first use). */
  private rebuild(kind: string, text: string): number {
    const segments = pretokenize(text)
    if (segments.length === 0) {
      this.state = null
      return 0
    }
    const lastIndex = segments.length - 1
    const state: SlotState = {
      kind,
      text,
      fixedTokens: sumSegments(segments, 0, lastIndex, this.table),
      lastSegText: segments[lastIndex] as string,
      lastSegTokens: countSegment(segments[lastIndex] as string, this.table),
      total: 0,
    }
    state.total = state.fixedTokens + state.lastSegTokens
    this.state = state
    return state.total
  }
}

/**
 * Incremental DeepSeek-token counter for a running turn's partial blocks.
 * Create one per turn (or per badge mount) and call `estimateBlocks` on every
 * partial publication.
 */
export class TokenEstimator {
  /** Resolves once the merge table is loaded (exact counts switched on). */
  readonly ready: Promise<void>
  private readonly slots: Slot[] = []
  private table: RankTable | null = null
  private readonly started: Promise<void>

  constructor() {
    this.started = loadRankTable().then(table => {
      this.table = table
    })
    this.ready = this.started
  }

  /**
   * Estimate the total output tokens of a partial's assistant blocks.
   * Exact once the merge table is ready; the oc-tps bytes/5 approximation
   * before that (the badge shows the same number either way, just less
   * precise for the first moments of a fresh profile).
   * @param blocks - the partial's assistant blocks.
   * @returns the token estimate.
   */
  estimateBlocks(blocks: readonly EstimatorBlock[]): number {
    const table = this.table
    if (table === null) {
      let approx = 0
      for (const block of blocks) {
        if (block.kind === 'text' || block.kind === 'reasoning') approx += approxTokens(block.text ?? '')
      }
      return approx
    }
    // Grow/realign slots against the current block list: matching kind and a
    // suffix-append text reuse the slot, anything else re-counts from zero.
    while (this.slots.length < blocks.length) {
      this.slots.push(new Slot(table))
    }
    while (this.slots.length > blocks.length) {
      this.slots.pop()
    }
    let total = 0
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i] as EstimatorBlock
      const slot = this.slots[i] as Slot
      if (block.kind !== 'text' && block.kind !== 'reasoning') continue
      total += slot.update(block.kind, block.text ?? '')
    }
    return total
  }

  /**
   * Drop all per-block state (turn boundary, block-list restructure). The
   * next `estimateBlocks` re-counts from scratch; exactness is unaffected.
   */
  reset(): void {
    this.slots.length = 0
  }
}

/**
 * Create an estimator bound to the shared merge table (the module-level
 * singleton is what the badge uses; tests create isolated instances).
 * @returns a fresh estimator.
 */
export function createEstimator(): TokenEstimator {
  return new TokenEstimator()
}

/**
 * One-shot exact count for a text (used by tests and diagnostics; no
 * incremental state). Waits for the merge table.
 * @param text - the text.
 * @returns the token count.
 */
export async function countExact(text: string): Promise<number> {
  const table = await loadRankTable()
  return countTextTokens(text, table, pretokenize)
}

/**
 * Count a partial's blocks exactly, one-shot (no incremental state). Used by
 * the badge's tests; production code uses TokenEstimator for the incremental
 * path.
 * @param blocks - the partial's assistant blocks.
 * @returns the token count.
 */
export async function countBlocksExact(blocks: readonly EstimatorBlock[]): Promise<number> {
  const table = await loadRankTable()
  let total = 0
  for (const block of blocks) {
    if (block.kind === 'text' || block.kind === 'reasoning') {
      total += countTextTokens(block.text ?? '', table, pretokenize)
    }
  }
  return total
}

/** Shared estimator instance for the badge's running turn. */
export const sharedEstimator = createEstimator()
