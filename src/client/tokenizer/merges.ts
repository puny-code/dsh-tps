// Compact DeepSeek BPE merge data: the generator script
// (scripts/build-tokenizer-data.mjs) turns tokenizer.json's merge list into
// varint (leftId, rightId) pairs and emits this module as a base64 constant.
// Symbol id 0..255 is a raw UTF-8 byte value; id 256+i is the output symbol
// of merge i (the merge table is in rank order, so a pair's rank is its
// index). Decoding uses `atob` only — no stream APIs, so the module runs in
// browsers and jsdom alike.
import { TOKENIZER_DATA_VERSION, TOKENIZER_MERGES, TOKENIZER_MERGES_BASE64 } from '../data/tokenizer-data.ts'

/** Pair key for the rank table: leftId * 2^17 + rightId (ids < 2^17). Safe int. */
export const PAIR_STRIDE_BITS = 17

/** Compose a pair key; stays a safe integer (ids < 2^17, so < 2^34). */
export function pairKey(leftId: number, rightId: number): number {
  return leftId * 2 ** PAIR_STRIDE_BITS + rightId
}

/**
 * Rank table: merged pair key → merge rank (0 = most frequent). Exposed so
 * callers can build one table and share it across estimators.
 */
export interface RankTable {
  /** Number of merges in the table. */
  readonly size: number
  /** Pair key → rank; absent means the pair is never merged. */
  readonly rank: Map<number, number>
}

let cached: Promise<RankTable> | null = null

/** Decode big-endian base-128 varints; ids fit in 17 bits (at most 3 bytes). */
function decodeVarints(bytes: Uint8Array): number[] {
  const out: number[] = []
  let value = 0
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] as number
    value = value * 128 + (b & 0x7f)
    if ((b & 0x80) === 0) {
      out.push(value)
      value = 0
    }
  }
  return out
}

/**
 * Load (once) and parse the DeepSeek merge table, returning a shared rank
 * table. Safe to call concurrently: the parse runs a single time.
 * @returns the rank table promise.
 */
export function loadRankTable(): Promise<RankTable> {
  if (cached === null) {
    if (TOKENIZER_DATA_VERSION !== 1) throw new Error(`unsupported tokenizer data version ${TOKENIZER_DATA_VERSION}`)
    const base64 = TOKENIZER_MERGES_BASE64
    cached = (async () => {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const ids = decodeVarints(bytes)
      if (ids.length !== TOKENIZER_MERGES * 2) {
        throw new Error(`merge blob size mismatch: ${ids.length} ids for ${TOKENIZER_MERGES} merges`)
      }
      const rank = new Map<number, number>()
      for (let i = 0; i < TOKENIZER_MERGES; i++) {
        const leftId = ids[2 * i] as number
        const rightId = ids[2 * i + 1] as number
        rank.set(pairKey(leftId, rightId), i)
      }
      return { size: TOKENIZER_MERGES, rank }
    })()
  }
  return cached
}
