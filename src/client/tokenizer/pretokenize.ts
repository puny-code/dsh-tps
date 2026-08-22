// DeepSeek-V3 pretokenizer port. The reference tokenizer.json declares a
// Sequence of four Split pretokenizers:
//
//   1. \p{N}{1,3}                        — 1-3 digit groups (Isolated)
//   2. [一-龥぀-ゟ゠-ヿ]+                 — CJK / kana runs (Isolated)
//   3. [!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~][A-Za-z]+
//      |[^\r\n\p{L}\p{P}\p{S}]?[\p{L}\p{M}]+
//      | ?[\p{P}\p{S}]+[\r\n]*
//      |\s*[\r\n]+
//      |\s+(?!\S)
//      |\s+                              — the main word/symbol grammar
//   4. ByteLevel (add_prefix_space=false, use_regex=false) — byte mapping
//      only; no regex split, no prefix space.
//
// Split(Isolated) keeps the matched substring as its own segment and hands
// the unmatched parts to the next pretokenizer; every segment is then
// byte-mapped and BPE-encoded independently (no merges across segment
// boundaries). The regexes below use the JS `u` flag equivalents of the Rust
// patterns: `\p{L}`, `\p{N}`, `\p{P}`, `\p{S}`, `\p{M}` are the same Unicode
// General Category aliases, `\s` is White_Space in both engines.
//
// The JS RegExp engine and Rust's `regex` crate agree on these regexes for
// the shipped patterns; the golden fixture (generated with the official
// tokenizers library) pins the end-to-end behavior.

// 1. Numbers: 1-3 digit groups (\p{N} covers Nd/Nl/No, e.g. ①②③).
const RE_DIGITS = /\p{N}{1,3}/gu
// 2. CJK Unified Ideographs + kana (Hiragana/Katakana), one run.
const RE_CJK = /[一-龥぀-ゟ゠-ヿ]+/gu
// 3. Main grammar: punctuation+letters, optional space+letters, optional
//    space+symbols(+newlines), whitespace+newline, trailing whitespace run.
const RE_MAIN =
  /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~][A-Za-z]+|[^\r\n\p{L}\p{P}\p{S}]?[\p{L}\p{M}]+| ?[\p{P}\p{S}]+[\r\n]*|\s*[\r\n]+|\s+(?!\S)|\s+/gu

/** One split pass: isolate every regex match as its own segment. */
function isolate(segment: string, re: RegExp): string[] {
  const out: string[] = []
  re.lastIndex = 0
  let last = 0
  for (let m = re.exec(segment); m !== null; m = re.exec(segment)) {
    if (m.index > last) out.push(segment.slice(last, m.index))
    out.push(m[0])
    last = m.index + m[0].length
    if (m[0].length === 0) re.lastIndex++ // belt-and-braces: never regress on a zero-width match
  }
  if (last < segment.length) out.push(segment.slice(last))
  return out
}

/**
 * Split `text` into DeepSeek pretokenizer segments, in order. Each returned
 * segment is encoded and BPE-merged independently.
 * @param text - the raw text.
 * @returns the segment list.
 */
export function pretokenize(text: string): string[] {
  let segments = [text]
  for (const re of [RE_DIGITS, RE_CJK, RE_MAIN]) {
    const next: string[] = []
    for (const segment of segments) next.push(...isolate(segment, re))
    segments = next
  }
  return segments
}
