# tuimuppeteer dev docs

This folder records findings while building a deterministic TUI harness.

## Recommendation

The tmux-based approach (like `llxprt-code/scripts/oldui-tmux-harness.js`) is the correct path forward for tuimuppeteer.

## Bun-first runtime

Mirror the `llxprt --experimental-ui` model: run tuimuppeteer TypeScript directly via Bun.
- No JS build step; publish sources and execute with `bun run`.
- Bun is required at runtime. No JavaScript failover or Node fallback is planned.
- If we later add a launcher for npm installability, it should still invoke Bun and keep JS artifacts out of the repo.
- Keep the CLI entrypoint in TS (e.g. `src/index.ts`).

## Unit test standards

- Behavioral tests only.
- Do not assert on mock-internal data structures.
- No structural snapshot tests.
- Mocks are allowed for prerequisites not under test (e.g., backend adapter).
- Use real JSON fixtures to validate schema behavior.
- Add smoke tests (stable shell script or similar) and optional llxprt smoke.

Rationale (empirical):
- tmux reliably captures both rendered screen and scrollback.
- tmux reliably observes LLXPRT's `/quit` shutdown screen ("Agent powering down") and clean exit.
- tmux works for code-puppy interactive as well once `SYN_API_KEY` is injected.

## PTY experiment

The PTY + `@xterm/headless` prototype remains as a debugging/reference tool:
- `../prototypes/pty_smoke.mjs`

Quick run:

```sh
SYN_API_KEY="$(cat ~/.synthetic_key)" node tuimuppeteer/prototypes/pty_smoke.mjs
```

Start with `findings_pty.md` for the detailed notes.
