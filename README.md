# tuimuppeteer

Tuimuppeteer is a Bun-first, JSON-driven harness for testing interactive TUIs. It runs terminal apps under a real backend (tmux or PTY), drives input, captures screen/scrollback, and asserts on terminal state.

## Goals
- JSON-first scripting with macros, sequences (tests), and scenarios (suites).
- Backend-agnostic core with tmux/pty adapters.
- Bun-only runtime with no JavaScript failover.

## Status
- Architecture and schema v1 drafted in `dev-docs/`.
- Implementation will be test-first (Vitest) with behavioral tests only.

## Docs
- `dev-docs/README.md`: project notes and standards
- `dev-docs/schema-v1.md`: schema draft
- `project-plans/20251219intial/plan.md`: architecture plan
- `project-plans/20251219intial/implementation.md`: test-first implementation plan
