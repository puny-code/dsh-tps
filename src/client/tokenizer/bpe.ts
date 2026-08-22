// Greedy byte-level BPE encoder over one pretokenizer segment. The algorithm
// is the canonical BytePairEncoding merge loop: repeatedly merge the adjacent
// symbol pair with the smallest rank until no mergeable pair remains. A
// binary min-heap over the live symbol nodes plus a doubly-linked list keeps
// this near O(n log n) for long segments; stale heap entries are dropped via
// lazy validation (a node is valid only while it is still alive and its pair
// rank matches the heap entry).
//
// Segment-local by construction: the pretokenizer isolates segments, and BPE
// merges never cross segment boundaries, so each segment is encoded
// independently and the token count of a text is the sum of its segment
// counts.
//
// Each segment is encoded as a whole (one-shot): BPE merge order depends on
// the entire segment — appending bytes can interleave a new merge with
// earlier-rank merges inside the already-merged prefix ('32' + '2' merges to
// ['322'] only via the ('22' → single) path, which an incremental state never
// reconsiders), so an incremental merge state would drift from the official
// count. Re-encoding the extended segment keeps the count identical to the
// official one-shot encode at O(segment length) per extension; segments are
// small in practice because the pretokenizer isolates words, number groups,
// and punctuation.
import { pairKey, type RankTable } from './merges.ts'

interface HeapEntry {
  rank: number
  /** Left node index of the pair (its right neighbour is next[i]). */
  i: number
}

/**
 * Heap order: smallest rank first; on a rank tie the leftmost pair wins
 * ((rank, i) lexicographic). This reproduces the reference greedy merge loop
 * ("merge the leftmost minimum-rank pair"), which is what the official
 * tokenizers implementation matches — a pathological ordering lets overlapping
 * equal-rank pairs produce different merge trees (e.g. 'a'*12 merges to
 * ['aaaaaaaa', 'aaaa'] only with the leftmost tie-break).
 */
function less(a: HeapEntry, b: HeapEntry): boolean {
  return a.rank < b.rank || (a.rank === b.rank && a.i < b.i)
}

/** Binary min-heap keyed by (rank, i). */
class MinHeap {
  private readonly items: HeapEntry[] = []

  get length(): number {
    return this.items.length
  }

  push(entry: HeapEntry): void {
    const items = this.items
    items.push(entry)
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      const p = items[parent] as HeapEntry
      if (less(p, entry)) break
      items[i] = p
      i = parent
    }
    items[i] = entry
  }

  pop(): HeapEntry | null {
    const items = this.items
    const top = items[0]
    if (top === undefined) return null
    const last = items.pop() as HeapEntry
    if (items.length > 0) {
      let i = 0
      for (;;) {
        const left = 2 * i + 1
        if (left >= items.length) break
        const right = left + 1
        let child = left
        if (right < items.length && less(items[right] as HeapEntry, items[left] as HeapEntry)) child = right
        const c = items[child] as HeapEntry
        if (less(c, last)) {
          items[i] = c
          i = child
        } else {
          break
        }
      }
      items[i] = last
    }
    return top
  }
}

/** One-shot BPE encoder for a fixed byte sequence. */
export class SegmentBpe {
  private readonly table: RankTable
  private readonly id: number[] = []
  private readonly prev: number[] = []
  private readonly next: number[] = []
  private readonly valid: number[] = []
  private readonly heap = new MinHeap()
  private alive = 0

  /** @param bytes - the segment's UTF-8 bytes (isolated by the pretokenizer). */
  constructor(bytes: Uint8Array, table: RankTable) {
    this.table = table
    if (bytes.length === 0) return
    this.append(bytes)
  }

  /** Current token count (symbols left after all merges). */
  get count(): number {
    return this.alive
  }

  /** Seed the byte sequence; merging runs to a stable state. */
  private append(bytes: Uint8Array): void {
    const { rank } = this.table
    const id = this.id
    const prev = this.prev
    const next = this.next
    const valid = this.valid
    let previous = -1
    for (let k = 0; k < bytes.length; k++) {
      const i = id.length
      id.push(bytes[k] as number)
      prev.push(previous)
      next.push(-1)
      valid.push(1)
      if (previous >= 0) {
        next[previous] = i
        const r = rank.get(pairKey(id[previous] as number, id[i] as number))
        if (r !== undefined) this.heap.push({ rank: r, i: previous })
      }
      previous = i
      this.alive++
    }
    this.drain()
  }

  /** Merge pending pairs until the segment is stable (no mergeable pair). */
  private drain(): void {
    const { rank } = this.table
    const id = this.id
    const prev = this.prev
    const next = this.next
    const valid = this.valid
    for (;;) {
      const entry = this.heap.pop()
      if (entry === null) break
      const i = entry.i
      const j = next[i] as number
      // Stale: either node was merged away since the push, or the pair's rank
      // changed (can't happen without a merge, but kept as the cheap check).
      if (j < 0 || valid[i] === 0 || valid[j] === 0) continue
      if (rank.get(pairKey(id[i] as number, id[j] as number)) !== entry.rank) continue
      // Merge: the pair's rank is the output symbol id offset (id 256 + rank).
      id[i] = 256 + entry.rank
      next[i] = next[j] as number
      const jn = next[j] as number
      if (jn >= 0) prev[jn] = i
      valid[j] = 0
      this.alive--
      const left = prev[i] as number
      if (left >= 0) {
        const r = rank.get(pairKey(id[left] as number, id[i] as number))
        if (r !== undefined) this.heap.push({ rank: r, i: left })
      }
      const right = next[i] as number
      if (right >= 0) {
        const r = rank.get(pairKey(id[i] as number, id[right] as number))
        if (r !== undefined) this.heap.push({ rank: r, i })
      }
    }
  }
}

/**
 * Count the DeepSeek tokens of one pretokenizer segment.
 * @param bytes - the segment's UTF-8 bytes (already isolated by the pretokenizer).
 * @param table - the merge rank table.
 * @returns the token count (0 for empty input).
 */
export function countSegmentTokens(bytes: Uint8Array, table: RankTable): number {
  if (bytes.length === 0) return 0
  return new SegmentBpe(bytes, table).count
}

/**
 * Count the DeepSeek tokens of a full text: pretokenize, then sum the BPE
 * token counts of each segment. Used by the estimators' exact path.
 * @param text - the raw text.
 * @param table - the merge rank table.
 * @param pretokenize - the pretokenizer (injected for testability).
 * @returns the token count.
 */
export function countTextTokens(
  text: string,
  table: RankTable,
  pretokenize: (text: string) => string[],
): number {
  if (text.length === 0) return 0
  const encoder = new TextEncoder()
  let total = 0
  for (const segment of pretokenize(text)) {
    total += countSegmentTokens(encoder.encode(segment), table)
  }
  return total
}
