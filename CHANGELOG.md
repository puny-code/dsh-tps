# Changelog

## 0.3.1

Adapted for DSH `0.2.x` (`0.2.1-rc.2` verified) while keeping `0.1.2-rc.1` support.

- **Mount seat fixed for 0.2.x.** DSH 0.2.x no longer renders the status row as a direct `[role="status"][aria-live="polite"]` child of `[data-chat-flow]`: it nests the row one wrapper deep (`[data-chat-flow] > div > div[data-chat-running]`) and keeps the visible copy in a `span[class*="runningContent"]` beside a visually hidden status span. The badge now descends into the flow for that row and targets the visible span (falling back to the last visible span, then to the row itself), so it renders inline with the "Deep diving…" text instead of never appearing. The 0.1.x `[role="status"]` lookup is retained as a fallback.
- **Peers widened.** All six `@deepseek-ai/dsh-client-*` peer ranges now read `^0.1.2-rc.1 || >=0.2.0-rc.1 <0.3.0-0`, which passes the 0.2.1 install gate while still resolving on 0.1.2.
- **MutationObservation tightened.** The observer now rescans on the row's own add/remove/replace — 0.2.x swaps the row under a wrapper, so the replacement shows up in `removedNodes` rather than as the record target — and no longer on every streaming mutation.
- **Tests.** Added `tests/mount-seat.spec.tsx` covering the 0.2.x row shape, a row nested more than one wrapper deep, row replacement between steps, the class-token-less fallback, and the 0.1.x shape.

## 0.3.0

- Hover fade, 5-second rolling window, bundled DeepSeek-V3 tokenizer, self-contained `prepare` build.
