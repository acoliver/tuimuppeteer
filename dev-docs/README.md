# tuimuppet dev docs

This folder is a durable pointer for recovering PTY/TUI harness work.

- Start with `findings_pty.md`.
- Primary runner: `../prototypes/pty_smoke.mjs`.

Quick run (uses the existing local synthetic key file; never print it):

```sh
SYN_API_KEY="$(cat ~/.synthetic_key)" node tuimuppet/prototypes/pty_smoke.mjs
```
