# tuimuppeteer: overall plan (draft)

## Phase 0: Prove the PTY backend (prototype)
- Choose a maintained Node PTY library and a terminal emulator usable in Node.
- Prove we can:
  - spawn an interactive program
  - drive it with keystrokes
  - observe terminal state robustly (grid + cursor)
  - implement “stable for N ms” and “region stable” primitives
- Use two real apps as canaries:
  - `llxprt-code` (legacy Ink UI)
  - `code_puppy`

Deliverables:
- `prototypes/pty_smoke.mjs` (or similar): a runnable prototype
- `dev-docs/findings_pty.md`: what worked, what didn’t, recommended stack

## Phase 1: JSON schema v1
- Define `script.json` schema v1:
  - spawn/term config
  - macros
  - steps
  - matchers/conditions
- Write schema docs and a validator.

## Phase 2: Engine + PTY backend
- Implement:
  - spawner
  - input encoder (keys, paste, mouse)
  - output → terminal emulator feed
  - snapshot API + diff utilities
  - waits/assertions with timeouts
  - artifacts writer (snapshots, diffs, transcript)

## Phase 3: Vitest binding
- Provide a thin adapter:
  - `runScript(pathOrObject, options)`
  - failure artifact capture
  - vitest-friendly timeouts

## Phase 4: tmux backend (optional)
- Add tmux backend for:
  - debugging sessions
  - copy-mode scrolling tests
- Keep behavior consistent with PTY snapshot interface (best-effort).

## Phase 5: Style assertions and richer locators
- Add style assertions (fg/bg/bold/etc).
- Add locator system (e.g., find text, then click relative).
- Add masking primitives for dynamic regions.

## Phase 6: Additional runners
- Add pytest runner (Python) that consumes the same JSON schema.
