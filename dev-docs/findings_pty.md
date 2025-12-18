# PTY backend findings (initial)

NOTE: If code-puppy ever spams "Enter your coding task" / "Input cancelled" in a loop, that’s almost always because the input layer (prompt_toolkit) is repeatedly receiving EOF/interrupts in the PTY (not because you should "try harder" with more keystrokes). Fix by ensuring the spawned process has a real PTY, and avoid piping/stdin-not-a-tty scenarios; the PTY harness should send normal characters + CR and forward CPR responses when needed.


# PTY backend findings (initial)

## Summary
Goal: prove a PTY-first backend suitable for *general* TUI testing (JSON-driven scenarios, macros, stability/flicker detection, cursor/focus checks, and later mouse/style assertions).

Prototype outcome:
- PTY spawning + headless terminal emulation works well enough to launch real interactive TUIs and drive them with keystrokes.
- `llxprt-code` can be launched and driven reliably in a PTY once the repo is built and the synthetic profile/keyfile are provided via CLI flags.
- `code-puppy` launches fine in a PTY, but fails to generate a haiku in this environment due to missing/invalid API key configuration (401).

## Prototype
- `prototypes/pty_smoke.mjs`
  - Uses `node-pty` to spawn an interactive program.
  - Feeds output into `@xterm/headless` to maintain a terminal grid + cursor.
  - Implements primitives needed by the future engine:
    - `waitForText(...)`
    - `stableFor(...)` (screen hash unchanged for duration)

Safety:
- The prototype *may read* `~/.synthetic_key` in order to set `SYN_API_KEY` for `code-puppy`, but it never prints the key contents.
- Output is minimally redacted to avoid printing the literal keyfile path or common key patterns.

## Research: candidate libraries (via Exa)
### PTY spawn
- `node-pty` (microsoft/node-pty)
  - Rationale: widely used Node PTY wrapper (commonly used anywhere a Node app needs to spawn a terminal program).
  - Tradeoff: native bindings.

Other candidates:
- `xterm-pty` (mame/xterm-pty)
  - Interesting because it’s designed around integrating PTY semantics with xterm.js-like terminal behavior.
  - Less common as a general Node test-runner dependency; would need evaluation.

### Terminal emulation / screen model
- `@xterm/headless` (xtermjs)
  - Rationale: maintained headless terminal emulator that runs in Node and maintains a real buffer model.
  - This is critical for “structure snapshots” (cell grid + cursor) and for measuring flicker/redraw.

Relevant maintenance note:
- The older `xterm` and `xterm-headless` packages have been deprecated in favor of scoped `@xterm/*` packages. `@xterm/headless` is the correct modern choice.

Why not “ANSI parsers” alone:
- Tokenizing escape sequences into styled spans is insufficient to model TUI state: TUIs rely on cursor addressing, clears, alternate screen buffers, and partial redraws.

## App smoke: results
### llxprt-code
Goal: launch LLxprt in a PTY, complete initial setup (provider/key/profile), and request a haiku from the interactive UI.

Result: **launch + interactive driving works**.

Key requirements:
- `scripts/start.js` requires `llxprt-code` to be built first; otherwise it fails due to missing `packages/cli/dist/...`.
- Reliable setup is done via CLI flags (not in-UI profile switching):
  - `node scripts/start.js --profile-load synthetic --keyfile ~/.synthetic_key`

Notes:
- For a general harness, waiting for “completion” should be done via stability-based waits (screen or region stable for N ms) rather than matching any one glyph.

### code-puppy
Goal: launch code-puppy, complete any first-run setup, and request a haiku.

Result: **launch works; haiku generation failed due to auth**.

Observed behavior:
- code-puppy displays a warning: `WARNING: your terminal doesn't support cursor position requests (CPR).`
- On submission it attempts to load a model (`synthetic-GLM-4.6`) and then fails with:
  - `Unexpected error: status_code: 401 ... Invalid API Key.`

Implication for tuimuppet:
- The PTY backend is sufficient to drive the UI, but the environment needs a valid code-puppy model/provider configuration.
- This is separate from PTY feasibility.

## Gaps / next steps
- Export a real structured snapshot (grid + cursor + attrs) to JSON.
- Add region hashing + masking so we can assert:
  - “transcript region stable while spinner animates”
  - “no redraw while user is scrolled/frozen” (copy-mode analogue)
- Implement mouse event injection via xterm mouse sequences.
- Decide on a minimal JSON schema v1 and keep vitest bindings thin (JSON runner).
