// Golden conformance suite for the DeepSeek-V3 tokenizer port. The fixture
// was generated with the official tokenizers library (Rust backend) from the
// DeepSeek tokenizer.json (see scripts/gen-golden.py); every expectation here
// is an official-tokenizer output, not a hand-written guess.
//
// Two surfaces are pinned:
//  - `cases`: one-shot token counts for hand-picked and random texts.
//  - `streams`: prefix cumulative counts for random chunked feeds — the
//    incremental estimator must reproduce the official count of every prefix,
//    which is exactly what the streaming badge needs.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { countSegmentTokens, countTextTokens } from '../src/client/tokenizer/bpe.ts'
import { countBlocksExact, countExact, createEstimator } from '../src/client/tokenizer/estimator.ts'
import { loadRankTable } from '../src/client/tokenizer/merges.ts'
import { pretokenize } from '../src/client/tokenizer/pretokenize.ts'

interface GoldenCase { text: string; tokens: number }
interface GoldenStream { text: string; parts: number[]; counts: number[] }

const golden = JSON.parse(
  readFileSync(new URL('./fixtures/deepseek-golden.json', import.meta.url), 'utf8'),
) as { cases: GoldenCase[]; streams: GoldenStream[] }

describe('DeepSeek tokenizer golden conformance', () => {
  it('counts every golden case exactly (one-shot encoder)', async () => {
    const table = await loadRankTable()
    for (const { text, tokens } of golden.cases) {
      expect(
        countTextTokens(text, table, pretokenize),
        `one-shot mismatch for ${JSON.stringify(text.slice(0, 40))}`,
      ).toBe(tokens)
    }
  }, 60_000)

  it('reproduces the official prefix counts through incremental streaming', async () => {
    const estimator = createEstimator()
    await estimator.ready
    for (const stream of golden.streams) {
      estimator.reset()
      for (let i = 0; i < stream.parts.length; i++) {
        // Golden parts are Python code-point indexes; slice by code point
        // (String.slice would cut surrogate pairs in half).
        const prefix = Array.from(stream.text).slice(0, stream.parts[i] as number).join('')
        const got = estimator.estimateBlocks([{ kind: 'text', text: prefix }])
        expect(
          got,
          `prefix ${i} of ${JSON.stringify(stream.text.slice(0, 28))}…`,
        ).toBe(stream.counts[i] as number)
      }
    }
  }, 60_000)

  it('aggregates text/reasoning blocks like the one-shot counter', async () => {
    const blocks = [
      { kind: 'reasoning', text: '让我想想…' },
      { kind: 'text', text: '你好世界！这是测试。' },
      { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' },
      { kind: 'text', text: '' },
    ]
    const exact = await countBlocksExact(blocks)
    expect(exact).toBeGreaterThan(0)
    const estimator = createEstimator()
    await estimator.ready
    expect(estimator.estimateBlocks(blocks)).toBe(exact)
  })

  it('returns zero for empty text (official octet: 0 tokens)', async () => {
    const table = await loadRankTable()
    expect(countTextTokens('', table, pretokenize)).toBe(0)
    expect(countSegmentTokens(new Uint8Array(0), table)).toBe(0)
    const estimator = createEstimator()
    await estimator.ready
    expect(estimator.estimateBlocks([{ kind: 'text', text: '' }])).toBe(0)
  })

  it('re-counts from scratch after reset without changing results', async () => {
    const estimator = createEstimator()
    await estimator.ready
    estimator.estimateBlocks([{ kind: 'text', text: 'Hello world' }])
    estimator.reset()
    expect(estimator.estimateBlocks([{ kind: 'text', text: 'Hello world' }])).toBe(
      await countExact('Hello world'),
    )
  })
})
