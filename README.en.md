# dsh-tps

Live TPS badge for DSH Web: real-time tokens-per-second rendered inside the "Deep diving…" running-turn status row, sharing that row's natural visibility lifecycle.

中文: [README.md](README.md)

![Demo](assets/dshtpsdemo.gif)

## Features

- **Real-time TPS via a built-in DeepSeek tokenizer**: a rolling 5s window samples streamed output with **exact** DeepSeek-V3 BPE token counts — the full pretokenizer (3 Split passes + byte mapping) and greedy merge over the shipped merge table, matching the official `tokenizers` library on tokenizer.json token-for-token (pinned by a 500+ case golden fixture). Streaming updates re-encode only "the last segment + the new delta" (sub-millisecond on normal output); the vocab/merge data ships in the bundle (~690KB), decoded async once (~0.2s) with a brief UTF-8 bytes/5 approximation until ready. The reading shows `--` after 1.5s without new tokens and resets on step boundaries; the badge mounts only once the first value arrives (one-shot fade-in), so a fresh turn never shows a bare `TPS --`, while mid-turn pauses keep the dash
- **Visibility follows the host row, zero adaptation**: the badge lives inside the "Deep diving… 7分25秒" row, so it disappears with the row when the turn ends or a takeover panel (question/approval) hides the composer flow — no hide logic for todo strips, queue rows, or question panels
- **No duplication of built-in stats**: window averages (AVG/TTFT/token totals) are the built-in StatsLine's job; this plugin deliberately owns only the instantaneous rate
- **Hover fade**: a 2s hover dwell fades the badge out and makes it click-through (`pointer-events: none`); while hidden it stays hidden for as long as the cursor is on or near the badge (8px margin), and once the cursor moves away a 3s grace period elapses before it restores (a return to the badge area cancels the pending restore) — a parked cursor never loops the cycle
- **Pure front-end**: all readings derive from the conversation snapshot — no store, no event listeners, no network calls

## Compatibility

Targets **DSH ≥ 0.1.0-rc.6** (peer range `^0.1.0-rc.6`), with **no downward compatibility** (the 0.0.1-rc.x-era APIs are not supported).

Slot note: the badge mounts into the `conversation.chat.turnStatus` slot — an extension point of ui-conversation that **no rc6-or-earlier release ships** (source checkouts do not have it either). Step 0 below patches the installed `dsh-client-ui-conversation` build artifacts (`lib/client.js` + `lib/types/client/contract/slots.d.ts`); no DSH source is touched.

## Installation guide

### Step 0: add the `conversation.chat.turnStatus` slot to DSH (one-time)

1. **Check whether the slot already exists**:

   ```sh
   grep -c "conversation.chat.turnStatus" <dsh>/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js
   ```

   `<dsh>` is the DSH install directory (for a global npm install: `node_modules/@deepseek-ai/dsh` under `npm root -g`; you can also locate the `dsh-client-ui-conversation` package directly). Output `1` or greater → already patched, skip to step 1.

2. **Apply the patch** (pick one per DSH version; when `git apply` refuses on a global npm install, use `patch -p1`):

   ```sh
   cd <dsh>
   # DSH 0.1.1-rc.2 (LF build artifacts; includes the lib/types contract declarations)
   git apply <dsh-tps>/patches/turnstatus-slot-0111rc2.patch
   # DSH 0.1.0-rc.6-era rc6 release
   git apply <dsh-tps>/patches/turnstatus-slot-rc6.patch
   ```

   Without git, use `patch -p1` (bundled with Git for Windows) or edit the two files by hand per the diff.

   > Reinstalling DSH overwrites the patch — re-apply after upgrades. If the patch fails with a line-ending mismatch, check the `lib/client.js` line endings (LF/CRLF) against the patch, or retry with `patch -p1 -l`.

### Step 1: install the plugin

```sh
cd <dsh>
dsh plugin --profile web add github:Small-tailqwq/dsh-tps
```

This package declares `dsh.bundle` (patch → `cordis.yml` in this repo), so `dsh plugin` **automatically** appends it to the profile's `dsh.profile.bundles` — no hand-written inserts. Git installs run the `prepare` build script; if pnpm blocks the build, add the package to the profile's `pnpm-workspace.yaml` `allowBuilds` as prompted and retry.

**Manual install** (when `dsh plugin` is unavailable): edit `~/.dsh/profiles/web/package.json`:

```json
"dependencies": {
  "dsh-tps": "github:Small-tailqwq/dsh-tps"
}
```

(For a local checkout use `"dsh-tps": "file:../dsh-tps"`, then `cd ~/.dsh/profiles/web && pnpm install`.) Then append `"dsh-tps"` to the `dsh.profile.bundles` array — `dsh plugin add` reconciles automatically, a manual edit must do it yourself (without the endpoint the plugin silently does not load).

### Step 2: verify and activate

```sh
dsh --profile web --dump-config | grep -A1 tps
# → - id: tps
#     name: 'dsh-tps'
```

Then **restart `dsh web`** (production has no HMR; client bundle revs are computed at boot, so a browser refresh alone may hit stale caches).

## Build and test (developing this repo)

The project is self-contained — **no DSH source checkout needed**:

```sh
pnpm install
pnpm run typecheck    # tsc -p tsconfig.json (strict)
pnpm test             # vitest (shape gate + metrics + component/lifecycle)
pnpm run build        # tsc emits lib/types declarations + tsdown emits lib/index.js and lib/client.js
pnpm run prepare      # consumer build: tsdown only, no type checking (runs automatically on git installs)
```

- `pnpm run dev`: tsdown watch.
- **Production mode**: restart `dsh web` after building.

## Verify

While a turn runs you should see:

```
Deep diving… 7分25秒 | TPS 12.3
```

The row (and the badge) disappear when the turn ends or a takeover panel appears.

## Usage notes

- Badge type is 14px/500 (`--dsw-font-s-strong-14`) so Latin capitals and digits (~0.7em visual height) read comparably against the 13px full-square CJK clock glyphs
- Hover 2s → fade → click-through; stays hidden while the cursor is on or near the badge (8px margin), restores 3s after the cursor leaves (a return cancels the restore); re-hovering starts the dwell again
- All timings are compile-time constants in `src/client/TpsOverlay.tsx`; there is no client-plugin config channel yet

## Relationship to the official package

This plugin originally lived in the early DeepSeek Harness monorepo as `packages/client/ui-tps` (official package name `@deepseek-ai/dsh-client-ui-tps`); it left the monorepo when the harness moved features to the ecosystem and is now distributed standalone. The `conversation.chat.turnStatus` slot patch (source version and the rc6 build-artifact version) is maintained in this repo; on a DSH release that already ships the slot, Step 0 can be skipped.

## Known Limitations and Deferred Work

- **Exact counting, but not the server's usage**: the rate is counted by this plugin's built-in DeepSeek-V3 tokenizer (identical to the official `tokenizers` library's `encode` on the shipped tokenizer.json); billable usage comes from the durable token-usage projection and the built-in StatsLine, and marginal edge cases (chat templates, special tokens, provider-side model tuning) may differ
- **Extremely long single segments occupy the main thread**: text without any pretokenizer break (e.g. tens of thousands of CJK chars, minified code) is re-encoded whole on every streaming update — normal output (words/number groups/punctuation segments) stays well under 1ms per update, while a pathological long segment can reach tens of milliseconds at the end of the stream
- **Async first-time init**: the merge table is decoded once at first use (~200–500ms); the badge shows the bytes/5 approximation until then and switches automatically
- **Fixed hover timings**: the dwell/fade durations and the hide-area margin are compile-time constants; no client-plugin config channel to tune them per deployment
- **Slot patch dependency**: rc6 requires the Step 0 build-artifact patch (see above)

## Re-generating data and the golden fixture

`src/client/data/tokenizer-data.ts` (the merge table; generated and committed) and `tests/fixtures/deepseek-golden.json` (official tokenizers output) can be rebuilt with (needs the official DeepSeek `tokenizer.json`, e.g. from the `deepseek-ai/DeepSeek-V3` repo):

```sh
node scripts/build-tokenizer-data.mjs <path/to/tokenizer.json>
python scripts/gen-golden.py <path/to/tokenizer.json> tests/fixtures/deepseek-golden.json
```

## License

BSD-3-Clause
