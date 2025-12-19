# Prototypes

## Status

The `node-pty` + `@xterm/headless` approach was an experiment.

Findings:
- It is good at spawning and sending keystrokes, and we can reliably detect hard process exit.
- It is not currently reliable for LLXPRT's clean shutdown UX (`/quit` showing "Agent powering down" and the process exiting quickly), and it does not provide tmux-like scrollback.

Recommended path forward for tuimuppeteer: drive these TUIs under tmux (like the LLXPRT tmux harness in `llxprt-code/scripts/oldui-tmux-harness.js`).

## `pty_smoke.mjs`

PTY-driven smoke test using `node-pty` + `@xterm/headless`.

- Keep this as a reference / debugging tool.
- Do not treat it as the canonical automation path for LLXPRT/code-puppy.

### Run

```sh
SYN_API_KEY="$(cat ~/.synthetic_key)" node tuimuppeteer/prototypes/pty_smoke.mjs
```
