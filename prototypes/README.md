# Prototypes

## `pty_smoke.mjs`

PTY-driven smoke test for driving TUIs using `node-pty` + `@xterm/headless`.

### What it validates

- `llxprt-code` can be driven interactively enough to submit a prompt and render a response.
- `code-puppy` can be driven interactively under a real PTY (avoids prompt_toolkit stdin EOF/cancel spam).
- Both are asked to produce a haiku containing a marker word (`mouth`) for robust detection.

### Run

```sh
# code-puppy needs SYN_API_KEY for the synthetic endpoint
SYN_API_KEY="$(cat ~/.synthetic_key)" node tuimuppet/prototypes/pty_smoke.mjs
```

### Notes

- We intentionally do **not** depend on brittle UI glyphs; we wait for the marker word instead.
- `/quit` is issued for both apps, but process termination is treated as best-effort (some TUI stacks can linger).
