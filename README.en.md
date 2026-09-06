# dsh-tps

A live TPS (tokens per second) badge beside the “Deep diving…” status in DSH Web.

中文: [README.md](README.md)

![Demo](assets/dshtpsdemo.gif)

## Installation

For **DSH `0.1.2-rc.1`**, run:

```sh
dsh plugin --profile web add 'github:Small-tailqwq/dsh-tps'
```

Restart your running DSH instance:

```sh
dsh web
```

Reopen the page and start a task. Once streamed output arrives, the badge appears:

```text
Deep diving… 24s  TPS 132
```

GitHub installs build the plugin automatically. If pnpm blocks build scripts, configure the Web profile's `allowBuilds` as prompted and retry.

### Install a local package

For a prebuilt `.tgz`, substitute its actual path:

```sh
dsh plugin --profile web add './dsh-tps-0.3.0-rc1-dom.tgz'
```

Prebuilt packages contain ready-to-load runtime code and require no Harness checkout or local compilation.

## Features

- **Live rate:** a rolling 5-second window counts streamed output with the built-in DeepSeek-V3 tokenizer.
- **Natural visibility:** appears with the first reading and disappears with the status row when the turn ends; shows `--` after roughly 1.5 seconds without output.
- **Hover fade:** fades after a 2-second hover, becomes click-through, and returns 3 seconds after the pointer moves away.
- **Language-independent mounting:** uses semantic DOM structure, without matching translated labels or CSS hashes.
- **Front-end only:** reads DSH session snapshots without extra network requests. The native stats line continues to provide averages, first-token latency, and total usage.

## Installed but not visible

1. Confirm the task is producing streamed output. The badge stays hidden while idle or before the first output arrives.
2. Confirm TPS is enabled. If you use `dshmarket`, enable it there too: the market restores its saved disable list, which profile configuration alone does not override.
3. Restart DSH after installing or replacing the package, then reopen the page.
4. Check the host version and whether the active skin preserves the chat status row. Other versions or altered layouts may require adaptation.

## Token counting

TPS uses the bundled DeepSeek-V3 tokenizer. It is not server billing usage or an exact count for other models' tokenizers. During tokenizer initialization, a UTF-8 byte approximation is used until BPE counting becomes available.

Extremely long text without tokenizer boundaries may increase main-thread work. Hover and restore timings are fixed, with no configuration UI.

## Development

Normal installation requires no Harness source. Development typechecking and tests resolve host interfaces through a sibling checkout:

```text
<parent>/
  deepseek-harness/  # dsh-v0.1.2-rc.1
  dsh-tps/
```

Run in this repository:

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

`pnpm run prepare` is the self-contained Git-install build. It does not read the sibling checkout and should produce the same runtime code as the full build. `pnpm run dev` watches source changes.

The plugin obtains session hooks through `conversation.composer.dock`, then uses a React Portal to mount into the direct `[role="status"][aria-live="polite"]` child of `[data-chat-flow]` within the current `[data-conversation-scroll]`. It manages only its own container and leaves host nodes in place.

### Regenerate tokenizer data

With the official DeepSeek-V3 `tokenizer.json`, run:

```sh
node scripts/build-tokenizer-data.mjs <path/to/tokenizer.json>
python scripts/gen-golden.py <path/to/tokenizer.json> tests/fixtures/deepseek-golden.json
```

## License

BSD-3-Clause. Originally distributed as `packages/client/ui-tps` in the early Harness monorepo.
