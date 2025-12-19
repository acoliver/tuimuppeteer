# tuimuppeteer implementation plan (test-first)

## Phase 0: Test scaffolding + quality gate
- Add `check` script (lint + typecheck + tests).
- Add vitest config and initial test harness.
- Add a stable smoke harness script (stdin prompt loop): prints `Ready>`, echoes input as `Echo: <line>`, exits on `quit`.
- Write first smoke test that runs the harness with a minimal scenario.

## Phase 1: Schema + loader (test-first)
- Write Zod schemas + fixture tests.
- Implement loader for macros/sequences/scenarios.
- Implement macro expansion with args + cycle detection.
- Tests: schema pass/fail, macro expansion, prereq resolution, scenario ordering.

## Phase 2: Planning + execution core (test-first)
- Implement `RunPlan` builder from loaded assets.
- Implement step execution engine with a fake backend for tests.
- Define report schema (Zod type) and emit JSON reports in tests.
- Tests: step execution ordering, defaults, timeouts, error artifacts.
- Add backend adapter contract tests (run against fake adapter, then tmux/pty).

## Phase 3: tmux backend (test-first)
- Implement tmux adapter (send keys, capture screen/scrollback, exit).
- Tests: adapter interface behavior using a stable shell harness.
- Add basic tmux smoke scenario.

## Phase 4: pty backend (test-first)
- Implement pty adapter (send keys, capture screen, exit).
- Tests: adapter interface behavior using the same harness.

## Phase 5: Runner CLI (test-first)
- Add CLI commands to run scenario/sequence.
- Support `--report` and `--captures` outputs.
- Tests: CLI emits report, uses captures path, respects defaults.

## Phase 6: Packaging (test-first)
- Finalize Bun-first packaging and npm entrypoint.
- Tests: CLI runs via `bun run` from package entry.
