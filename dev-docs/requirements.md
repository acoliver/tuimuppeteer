# tuimuppet: requirements (draft)

## Goal
Provide a JSON-first, general-purpose framework for testing interactive TUIs (text user interfaces) by driving them through a real PTY/terminal emulation layer and asserting on terminal state.

The system should support:
- Scenario scripting via JSON (with a stable, versioned schema).
- Macro expansion (reusable navigation/setup flows).
- Robust assertions around cursor/focus, stability/flicker, and region-based screen content.
- Multiple backends (PTY as primary; tmux as optional backend for debugging / copy-mode style interactions).
- Test-runner bindings (vitest first; designed so pytest/others can be added without changing the JSON format).

Non-goals (initially):
- Deep semantic knowledge of any single app’s UI components.
- Perfect pixel/UI-widget testing. This is terminal-state testing.

## Target applications
Initial compatibility targets:
- `llxprt-code` legacy Ink UI
- `code_puppy`

Later targets:
- `llxprt-code` OpenTUI UI
- `opencode`
- other terminal apps

## Core capabilities
### Execution
- Spawn an interactive program in a PTY with configured rows/cols.
- Send input: text, key chords, bracketed paste.
- Send mouse events: move/click/drag/wheel with modifiers.
- Resize (SIGWINCH) support.

### Observation
- Capture terminal state as a structured snapshot:
  - cell grid (rows × cols)
  - cursor position/visibility
  - optional style attributes (fg/bg/bold/etc)
  - optional scrollback
  - alternate-screen awareness

### Assertions & waits
- Wait for text/regex in full screen or a region.
- Assert cursor position/visibility and cursor stability.
- Stability checks:
  - screen/region stable for N ms
  - allowed-noise masking (ignore regions like spinners)
- Flicker/redraw metrics:
  - measure change rate (frames, changed cells)
  - assert “no redraw in region” over a duration

### Scripting & macros
- JSON scripts with versioned schema.
- Macros with parameters, composition, cycle detection.
- Artifacts on failure: last snapshots, diffs, transcript.

## Portability requirements
- Runs in CI without a full terminal multiplexer.
- Does not require network access by default.
- Avoids app-specific assumptions (no baked-in “approval dialog” logic).

## Security requirements
- Never read or exfiltrate secret keys.
- Treat `~/.synthetic_key` as sensitive input only; do not log its content.
- Default artifact capture must redact secrets by configurable rules.
