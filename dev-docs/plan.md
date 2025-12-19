# tuimuppeteer: overall plan (draft)

## Phase 0: Prove the tmux backend (prototype)
- Choose a maintained tmux approach and stable harness scripts.
- Prove we can:
  - spawn an interactive program
  - drive it with keystrokes
  - observe terminal state robustly (screen + scrollback)
  - implement “stable for N ms” primitives
- Use two real apps as canaries:
  - `llxprt-code` (legacy Ink UI)
  - `code_puppy`

Deliverables:
- tmux-driven prototype (shell or Node harness)
- `dev-docs/findings_tmux.md`: what worked, what didn’t, recommended stack

## Phase 1: JSON schema v1
- Define `script.json` schema v1:
  - spawn/term config
  - macros
  - steps
  - matchers/conditions
- Write schema docs and a validator.

## Phase 2: Engine + tmux backend
- Implement:
  - spawner
  - input encoder (keys, paste, mouse)
  - output capture (screen + scrollback)
  - waits/assertions with timeouts
  - artifacts writer (captures, transcript)

## Phase 3: Vitest binding
- Provide a thin adapter:
  - `runScript(pathOrObject, options)`
  - failure artifact capture
  - vitest-friendly timeouts

## Phase 4: Style assertions and richer locators
- Add style assertions (fg/bg/bold/etc).
- Add locator system (e.g., find text, then click relative).
- Add masking primitives for dynamic regions.

## Phase 5: Additional runners
- Add pytest runner (Python) that consumes the same JSON schema.
