# tuimuppeteer JSON schema v1 (draft)

Goal: a JSON-first TUI harness with reusable macros, reusable sequences (tests), and scenarios (suites). The schema is intentionally backend-agnostic and avoids app-specific logic.

## Top-level files

We separate scripts into three file types.

### 1) Macros file

Macros are reusable input flows. They never assert. They may wait or sleep.

```json
{
  "schemaVersion": "v1",
  "macros": {
    "setCodex": [
      { "type": "line", "text": "/provider codex" },
      { "type": "line", "text": "/model gpt-5.2-codex" },
      { "type": "line", "text": "/set reasoning.effort xhigh" }
    ]
  }
}
```

### 2) Sequence file

A sequence is a single test flow with assertions. Sequences can declare prerequisites (other sequences) and an optional `ensure` check that runs before the steps (after the implicit `ensureRunning` check).

```json
{
  "schemaVersion": "v1",
  "name": "login",
  "prerequisites": ["app-ready"],
  "ensure": { "contains": "Login" },
  "steps": [
    { "type": "line", "text": "alice" },
    { "type": "line", "text": "secret" },
    { "type": "waitFor", "contains": "Welcome" }
  ]
}
```

### 3) Scenario file

A scenario is a suite: it launches the app and runs a sequence order. Scenarios do not branch. Sequences run in the same live session.

```json
{
  "schemaVersion": "v1",
  "name": "basic",
  "launch": {
    "command": "./launch_llxprt_codex.sh",
    "args": ["--experimental-ui"],
    "cwd": ".",
    "backend": "tmux",
    "cols": 120,
    "rows": 40,
    "startupTimeoutMs": 30000,
    "readyMatcher": { "contains": "Type your message" }
  },
  "defaults": {
    "waitTimeoutMs": 15000,
    "pollMs": 200,
    "scrollbackLines": 2000,
    "postTypeMs": 600
  },
  "artifacts": {
    "report": "stdout",
    "capturesDir": "./captures",
    "redact": true,
    "redactPatterns": ["sk-[A-Za-z0-9]+"]
  },
  "sequenceOrder": ["login", "profile-load", "haiku", "exit"]
}
```

Launch notes:
- `launch.command` should be a launcher script (e.g. `launch_llxprt_codex.sh`) that sets secrets/config.
- `launch.cwd` controls where the launcher runs from.
- Launcher should print a PID on stdout line 1 (runner uses it for `ensureRunning`).

## Engine behaviors


- **Implicit ensure running**: before every sequence, the engine verifies the app is still running (PID observed from launcher).
- **Sequence ensure**: if `sequence.ensure` exists, run it before sequence steps.
- **Prerequisites**:
  - When a sequence is run by itself, run its `prerequisites` first.
  - When run as part of a scenario, only the previous sequence must pass; prerequisites are not auto-run.
- **Macros** can be nested, parameterized, and are expanded before execution.

## Shared defaults

Scenario-level defaults apply to all steps unless a step overrides them.

```json
{
  "defaults": {
    "waitTimeoutMs": 15000,
    "pollMs": 200,
    "scrollbackLines": 2000,
    "postTypeMs": 600
  }
}
```

## Macro expansion

Macro steps allow parameterization using `${name}` placeholders.

```json
{
  "macros": {
    "login": [
      { "type": "waitFor", "contains": "Username" },
      { "type": "line", "text": "${username}" },
      { "type": "line", "text": "${password}" }
    ]
  }
}
```

```json
{ "type": "macro", "name": "login", "args": { "username": "alice", "password": "secret" } }
```

## Report schema

```json
{
  "schemaVersion": "v1",
  "scenario": "basic",
  "startedAt": "2025-12-19T15:30:00Z",
  "finishedAt": "2025-12-19T15:31:00Z",
  "status": "passed",
  "sequences": [
    {
      "name": "login",
      "status": "passed",
      "steps": [
        {
          "id": "step-1",
          "type": "line",
          "status": "passed",
          "durationMs": 150,
          "error": null
        }
      ],
      "artifacts": ["./captures/login-screen.txt"]
    }
  ]
}
```

## Step types (v1)

### Input
- `line`: types text and submits with Enter (uses `postTypeMs`, `submitKeys`).
  - `submitKeys`: optional list of keys to submit (default `Enter`).
- `sendKeys`: sends a string of key names (e.g. `Enter`, `C-c`).
- `keys`: sends a list of key names in order.
- `paste`: bracketed paste payload.
- `mouse`: move/click/drag/wheel with modifiers (backend-dependent).
- `scroll`: up/down/page/top/bottom (backend-dependent).
- `resize`: resize terminal (cols/rows).
- `sleep`: fixed delay.
- `macro`: expands to macro steps.

### Wait / Assert
- `waitFor`: matcher must appear in `screen` or `scrollback`.
- `waitForNot`: matcher must disappear from `screen` or `scrollback`.
- `expect`: matcher must appear in `screen` or `scrollback` (assertion).
- `expectCount`: matcher count equals/atLeast/atMost.
- `waitForExit`: process/pane exit.

### Capture
- `capture`: capture `screen`, `scrollback`, or both.

## Reports

Report output is JSON with scenario, sequence, and step results plus artifact references. The report is emitted to stdout by default or to `artifacts.report` when set to a filepath.

## Matchers

A matcher is defined by either `contains` or `regex`.

```json
{ "type": "waitFor", "contains": "Welcome" }
```

```json
{ "type": "expect", "regex": "Welcome, [A-Za-z]+" }
```

## Step fields (common)

- `id`: optional step identifier for reports/debugging.
- `description`: optional human-readable description.
- `timeoutMs` (defaults from scenario).
- `pollMs` (defaults from scenario).
- `scope`: `screen` | `scrollback` (defaults to `screen`).
- `scrollbackLines` (defaults from scenario).
- `capturesDir`: optional override for capture steps.

## Directory layout (suggested)

```
macros/*.json
sequences/*.json
scenarios/*.json
```

## Bun-only stance

This project intentionally **does not** support JavaScript failover. Running requires Bun. Any future npm launcher should still invoke Bun and keep JS artifacts out of the repo.
