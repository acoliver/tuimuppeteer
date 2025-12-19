# tuimuppeteer: initial architecture plan (2025-12-19)

## Goals
- JSON-first TUI harness with macros, sequences, scenarios.
- Backend-agnostic core with tmux/pty adapters.
- Bun-only runtime (no JS failover).
- Publish via npm but execute TS with Bun, mirroring `llxprt --experimental-ui`.

## Zod schema outline

Define schemas that mirror the JSON files:

- `MacroFileSchema`
  - `schemaVersion: "v1"`
  - `macros: Record<string, Step[]>`

- `SequenceSchema`
  - `schemaVersion: "v1"`
  - `name: string`
  - `prerequisites?: string[]`
  - `ensure?: Matcher`
  - `steps: Step[]`

- `ScenarioSchema`
  - `schemaVersion: "v1"`
  - `name: string`
  - `launch: LaunchConfig`
  - `defaults?: Defaults`
  - `sequenceOrder: string[]`

- `StepSchema` (discriminated union, `type`)
  - Input: `line`, `sendKeys`, `keys`, `paste`, `mouse`, `scroll`, `resize`, `sleep`, `macro`
  - Wait/assert: `waitFor`, `waitForNot`, `expect`, `expectCount`, `waitForExit`
  - Capture: `capture`
  - Common fields: `id?`, `description?`, `scope?`, `timeoutMs?`, `pollMs?`, `scrollbackLines?`, `capturesDir?`
  - `submitKeys?: string[]` (line step)


- `Matcher`
  - `contains?: string` | `regex?: string` + `regexFlags?: string`

- `LaunchConfig`
  - `command: string` (path to a launcher script)
  - `args?: string[]`
  - `cwd?: string`
  - `backend: "tmux" | "pty"`
  - `cols?: number`, `rows?: number`
- `ArtifactsConfig`
  - `report?: "stdout" | string` (filepath)
  - `capturesDir?: string`
  - `redact?: boolean`
  - `redactPatterns?: string[]`


  - `startupTimeoutMs?: number`
  - `readyMatcher?: Matcher`


- `Defaults`
  - `waitTimeoutMs?: number`
  - `pollMs?: number`
  - `scrollbackLines?: number`
  - `postTypeMs?: number`

## Architecture

### Load-time
- Read JSON files from `macros/`, `sequences/`, `scenarios/`.
- Validate with Zod (schema + structural integrity).
- Resolve names (duplicate detection, missing refs).
- Expand macros, substitute args, build `RunPlan`.
- Resolve prerequisites when a sequence is run standalone.

### Runtime
- Launch app once per scenario via backend adapter using a scenario launcher script.
- Record PID from launcher for `ensureRunning` checks.
- Report output: `stdout` or `--report` filepath; capture output via `--captures` directory.
- Define report schema (scenario/sequence/step results + artifact refs).
- For each sequence:
  - `ensureRunning` implicit check.
  - Optional `sequence.ensure` matcher.
  - Execute steps with defaults + per-step overrides.
  - Capture artifacts on failure (screen, scrollback, step JSON).
## Test-first + lint gate

- Use vitest for unit tests.
## Backend adapter contract

Define a shared interface for adapters and test it via a contract test suite.

- `launch(config)` -> `{ pid, sessionId }`
- `isRunning()` -> boolean
- `sendKeys(keys)`
- `sendLine(text)`
- `paste(text)`
- `resize(cols, rows)`
- `captureScreen()`
- `captureScrollback(lines)`
- `waitForExit(timeoutMs)`


- Add a `check` script that runs `bunx eslint`, `bunx tsc --noEmit`, and `bunx vitest run`.
- CI (or local preflight) should only accept `check` as the quality gate.
- Behavioral tests only; no structural snapshots.


- Emit run report (sequence pass/fail + artifact paths).

### Backend adapters
- `tmux`: send keys, capture screen/scrollback, copy-mode scroll.
- `pty`: send keys/mouse, capture screen (headless terminal), exit detection.
- Shared interface: `sendKeys`, `captureScreen`, `captureScrollback`, `waitForExit`, `resize`.

## Unit testing standards (tuimuppeteer)

### Principles
- Behavioral tests only.
- Do not assert on mock-internal data structures.
- No structural snapshot tests.
- Mocks are allowed for prerequisites not under test (e.g., backend adapter).
- Use real JSON fixtures to validate schema behavior.

### Test categories
- Schema validation tests (pass/fail cases).
- Macro expansion tests (args, nested macros, cycle detection).
- Sequence prerequisites resolution tests.
- Scenario run plan ordering tests.
- Backend interface contract tests using faked adapter responses (behavioral).
- Smoke tests using a stable harness app (shell echo/any-key) and optional llxprt smoke.

## Packaging (npm, Bun runtime)

- Publish source TS (no JS build artifacts).
- `package.json`:
  - `exports` points to TS entrypoints.
  - `engines.bun` required.
  - `bin` or launcher invokes `bun run` on TS entry.
- Runtime expects Bun installed; no Node fallback.
- Similar to `@vybestack/llxprt-ui`:
  - No build step; `bun run src/main.tsx` execution.

## Missing pieces to review

- Artifact redaction rules (toggleable, per scenario/sequence).
- Runner integration (Vitest / Pytest bindings) interface.
- Cross-platform key naming and mouse sequences (include terminal profiles like kitty).
- Clipboard behavior (default off unless enabled).
- Launcher strategy (scenario-level shell scripts for secrets/config).
