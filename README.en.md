# dsh-tps

Live TPS badge for DSH Web: real-time tokens-per-second rendered inside the "Deep diving…" running-turn status row, sharing that row's natural visibility lifecycle.

中文: [README.md](README.md)

![Demo](assets/dshtpsdemo.gif)

## Features

- **Instantaneous TPS only**: a rolling 5s window samples streamed output (UTF-8 bytes / 5 estimate); the reading shows `--` after 1.5s without new tokens and resets on step boundaries; the badge mounts only once the first value arrives (one-shot fade-in), so a fresh turn never shows a bare `TPS --`, while mid-turn pauses keep the dash
- **Visibility follows the host row, zero adaptation**: the badge lives inside the "Deep diving… 7分25秒" row, so it disappears with the row when the turn ends or a takeover panel (question/approval) hides the composer flow — no hide logic for todo strips, queue rows, or question panels
- **No duplication of built-in stats**: window averages (AVG/TTFT/token totals) are the built-in StatsLine's job; this plugin deliberately owns only the instantaneous rate
- **Hover fade**: a 2s hover dwell fades the badge out and makes it click-through (`pointer-events: none`); while hidden it stays hidden for as long as the cursor is on or near the badge (8px margin), and once the cursor moves away a 3s grace period elapses before it restores (a return to the badge area cancels the pending restore) — a parked cursor never loops the cycle
- **Pure front-end**: all readings derive from the conversation snapshot — no store, no event listeners, no network calls

## Installation guide

### Step 0: Prerequisites

1. **A harness checkout containing the `conversation.chat.turnStatus` slot**. Verify:

   ```sh
   grep -n "conversation.chat.turnStatus" <harness>/packages/client/ui-conversation/src/client/apply.ts
   ```

   Output means the slot exists; nothing means your snapshot predates it — apply the patch shipped with this repo first (four ui-conversation files only: slots.ts / apply.ts / ChatView.tsx / ChatView.module.css; reversible with `git checkout`):

   ```sh
   cd <harness>
   git apply <dsh-tps>/patches/turnstatus-slot.patch
   ```

   Note: the slot change is committed to the author's *personal* snapshot repo (`dsh2026/test-Small-tailqwq`), but the group's daily snapshots are updated by a **separate process** — pushes to a personal repo do not automatically reach other members' snapshots. So for now **every internal tester applies this patch** (or lets the AI install skill below do it); the step becomes optional only once the slot lands in the shared snapshot-update flow.

2. **Private repo access**: this is a private dsh-external repository; use an authenticated `gh` (or a PAT):

   ```sh
   gh auth status
   git clone https://github.com/dsh-external/dsh-tps.git
   ```

### Route 1: AI-assisted install (zero manual code edits, recommended)

This repo ships `SKILL.md` (`dsh-tps-install`). After cloning, tell your AI "install dsh-tps following `SKILL.md` in the dsh-tps repo"; the AI detects the slot, applies the patch when missing, verifies, rebuilds the ui-conversation bundle, mounts the plugin, and runs acceptance. Alternatively drop `SKILL.md` into a local skills directory for the AI to discover.

### Route 2: `dsh plugin` command (recommended manual route)

```sh
cd <harness>
dsh plugin --profile web add <path-to-dsh-tps>
# or via a GitHub dependency
dsh plugin --profile web add github:dsh-external/dsh-tps
```

This package declares `dsh.bundle` (patch → `cordis.yml` in this repo), so `dsh plugin` **automatically** appends it to the profile's `dsh.profile.bundles` (see "dsh endpoints" below) — no hand-written inserts. Git installs run the `prepare` build script; if pnpm blocks the build, add the package to the profile's `pnpm-workspace.yaml` `allowBuilds` as prompted and retry.

### Route 3: Manual install (when `dsh plugin` is unavailable)

**Step 1 — add the dependency.** Edit `dependencies` in `~/.dsh/profiles/web/package.json`:

```json
"dependencies": {
  "@dsh-external/dsh-tps": "github:dsh-external/dsh-tps"
}
```

(For a local checkout use `"@dsh-external/dsh-tps": "file:../dsh-tps"`, then `cd ~/.dsh/profiles/web && pnpm install`.)

**Step 2 — add the dsh endpoint** (next section). **Step 3 — verify**: `dsh --profile web --dump-config | grep -A1 tps`.

> Alternative mount: append the insert row to the profile's `cordis.patch.yml` directly, or launch with `dsh web --patch ./cordis.yml` (shipped in this repo) — both still require the package in the dependency graph.

### dsh endpoints (`dsh.profile.bundles`) tutorial

**What an endpoint is**: the profile's `dsh.profile.bundles` array is the profile's **composition endpoint list** — at boot the harness stacks each bundle's patch layer (`dsh.bundle.patch` → `cordis.patch.yml`/`cordis.yml`) in array order, and a plugin row only enters the composed config if its bundle is in this array. Think of it as "which bundle layers this profile mounts".

**How to create one** (continuing Route 3): edit `~/.dsh/profiles/web/package.json`:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@dsh-external/dsh-tps"
      ]
    }
  }
}
```

Then `cd ~/.dsh/profiles/web && pnpm install` and verify:

```sh
dsh --profile web --dump-config | grep -A1 tps
# → - id: tps
#     name: '@dsh-external/dsh-tps'
```

**Why a manual endpoint is needed**:

- `dsh plugin --profile web add` **auto-reconciles** after install: it detects the `dsh.bundle` declaration and appends the package name to `dsh.profile.bundles`.
- But when you install the dependency by **editing `package.json` directly or via `pnpm add`, the `dsh.profile.bundles` array is not updated automatically** — patch layers load only from that array.
- **Consequence of skipping the endpoint**: the package is installed, but its patch layer never joins the composition → no `tps` row in the composed config → **the plugin silently does not load** (no error). Adding the endpoint manually is doing the reconcile step of `dsh plugin add` yourself.

### Layout and dependencies (when developing this repo)

The plugin references the harness checkout through `link:` devDependencies, defaulting to sibling layouts:

```
deepseek-harness/   ← harness source checkout (with the turnStatus slot)
dsh-tps/            ← this repository
```

If your checkouts use another layout, adjust every `link:../../deepseek-harness/...` entry in `package.json`, then `cd dsh-tps && pnpm install`.

### Build and activate

```sh
cd dsh-tps
pnpm run build          # tsc + tsdown: emits lib/index.js and lib/client.js
```

- **Development mode** (`dsh web --dev` + `pnpm run dev:web` watcher): client-plugin bundles hot-reload after building.
- **Production mode**: **restart `dsh web`** after building (client bundle revs are computed at boot; a browser refresh alone may hit stale caches).

### Verify

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

This repository is the standalone distribution; the upstream source mirrors `packages/client/ui-tps` in the DeepSeek Harness monorepo (official package name `@deepseek-ai/dsh-client-ui-tps`), differing only in the standalone build wrapper and the `@dsh-external/tps` naming.

## Known Limitations and Deferred Work

- **Estimated live tokens**: the streaming partial carries no live token counts, so the rate estimates tokens from UTF-8 bytes (bytes/5); exact accounting stays with the durable token-usage projection and the built-in StatsLine
- **Fixed hover timings**: the dwell/fade durations and the hide-area margin are compile-time constants; no client-plugin config channel to tune them per deployment
- **Internal slot dependency**: requires a harness with the `conversation.chat.turnStatus` slot (see Step 0)

## License

BSD-3-Clause
