# tmux harness findings

## Summary

The tmux-based harness approach is empirically more reliable than the PTY + headless terminal experiment for driving LLXPRT and code-puppy.

Key strengths:
- tmux provides a real terminal environment (TTY semantics) plus reliable screen + scrollback capture.
- tmux can drive keys and scroll actions using built-in commands.

## LLXPRT (legacy UI)

Using `llxprt-code/scripts/oldui-tmux-harness.js`, the harness reliably demonstrates:
- `/quit` leads to the shutdown UI containing "Agent powering down".
- the pane exits (process ends) and tmux can still capture the final screen.

## LLXPRT (experimental UI)

Add a tmux script/run that targets `llxprt --experimental-ui` with this flow:
- `/profile load synthetic` then Enter (before the haiku prompt).
- send `Write me a haiku` after profile load.
- exit with Ctrl-C (no `/quit` in experimental UI yet).

## code-puppy

Using the same tmux harness with a script that overrides `startCommand` to run code-puppy:
- code-puppy runs reliably in interactive mode under tmux (prompt_toolkit behaves).
- ensure the synthetic endpoint key is available:
  - set `SYN_API_KEY` from `~/.synthetic_key` within the tmux-started command.

Reference script:
- `llxprt-code/scripts/oldui-tmux-script.code_puppy.haiku-exit.json`

## PTY + headless experiment

The PTY + `@xterm/headless` approach is useful for:
- spawning processes and observing hard exits (`onExit` is reliable).

But it is currently not a good fit as the primary harness because:
- it does not provide tmux-like scrollback/capture semantics.
- it has not been able to reproduce LLXPRT's deterministic clean shutdown UX under automation.
