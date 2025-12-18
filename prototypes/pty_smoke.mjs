#!/usr/bin/env node
/*
  PTY smoke prototype:
  - Spawns a command in a PTY (node-pty)
  - Feeds output into @xterm/headless to maintain a terminal grid + cursor
  - Forwards terminal response sequences (CPR/DA/etc) back to the child

  Why forward terminal responses?
  - Some TUIs (notably prompt_toolkit, used by code-puppy) send queries like:
      - CPR (cursor position report): ESC[6n
      - DA (device attributes): ESC[c
      - Kitty protocol query: ESC[?u
    A real terminal responds on stdin with sequences like ESC[<row>;<col>R.
    With node-pty + xterm/headless we can emulate that by:
      - feeding child stdout -> xterm/headless
      - forwarding xterm/headless "onData" -> child stdin

  Important findings so far:
  - LLXPRT interactive submit DOES work under PTY when sending CR ("\r").
    The earlier "Enter doesn't submit" symptom was due to driving too early or
    to the harness not being a true TTY; PTY-based runs are fine.
  - code-puppy interactive prints:
      "WARNING: your terminal doesn't support cursor position requests (CPR)."
    unless we implement the response forwarding described above.
  - code-puppy also supports non-interactive mode via `--prompt`, which is a
    reliable fallback if full interactive automation is flaky.

  This is a prototype, not the final engine.
*/

import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import fs from 'node:fs';

import xtermHeadless from '@xterm/headless';
import pty from 'node-pty';

const { Terminal } = xtermHeadless;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nowMs() {
  return Date.now();
}

function getHome() {
  const home = os.homedir();
  if (!home) throw new Error('No home directory');
  return home;
}

function redactSecrets(text) {
  // Minimal redaction:
  // - We may read `~/.synthetic_key` to set env vars, but never print it.
  // - We avoid printing the home directory path to reduce accidental leakage.
  const home = os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .replace(new RegExp(home, 'g'), '~')
    .replace(/\.synthetic_key/g, '[REDACTED_KEYFILE]')
    .replace(/syn_[A-Za-z0-9_\-]{8,}/g, '[REDACTED_SYN_KEY]');
}

function stripAnsi(text) {
  // Prototype-grade ANSI stripper: remove CSI and OSC sequences that otherwise
  // break simple substring matching (e.g. "esc to cancel" is interleaved with color codes).
  return text
    // OSC ... BEL
    .replace(/\x1b\][^\x07]*\x07/g, '')
    // CSI ... cmd
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    // Single ESC leftovers
    .replace(/\x1b/g, '');
}



function termToPlainText(term) {
  const buf = term.buffer.active;
  const lines = [];
  for (let y = 0; y < term.rows; y += 1) {
    const line = buf.getLine(y);
    lines.push(line ? line.translateToString(true) : '');
  }
  return lines.join('\n');
}

function snapshotToJson(term) {
  const buf = term.buffer.active;
  const cursor = getCursor(term);

  const rows = [];
  for (let y = 0; y < term.rows; y += 1) {
    const line = buf.getLine(y);
    if (!line) {
      rows.push([]);
      continue;
    }

    const cells = [];
    for (let x = 0; x < term.cols; x += 1) {
      const cell = line.getCell(x);
      if (!cell) {
        cells.push({ ch: ' ' });
        continue;
      }
      cells.push({ ch: cell.getChars() || ' ' });
    }
    rows.push(cells);
  }

  return {
    cols: term.cols,
    rows: term.rows,
    cursor,
    grid: rows,
  };
}

function getCursor(term) {
  // xterm/headless uses _core for some state; keep best-effort for prototype.
  const x =
    typeof term.cursorX === 'number'
      ? term.cursorX
      : term?._core?._inputHandler?._activeBuffer?.x;
  const y =
    typeof term.cursorY === 'number'
      ? term.cursorY
      : term?._core?._inputHandler?._activeBuffer?.y;
  return { x, y };
}

function hashScreen(text) {
  // Simple non-crypto hash for stability detection.
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function stableFor({ term, durationMs, sampleMs = 50 }) {
  const start = nowMs();
  let last = hashScreen(termToPlainText(term));
  let stableStart = nowMs();

  while (nowMs() - start < durationMs + 2000) {
    await sleep(sampleMs);
    const next = hashScreen(termToPlainText(term));
    if (next !== last) {
      last = next;
      stableStart = nowMs();
      continue;
    }
    if (nowMs() - stableStart >= durationMs) {
      return;
    }
  }
  throw new Error(`Screen did not stabilize for ${durationMs}ms`);
}

async function waitForText({ term, contains, timeoutMs = 15000, pollMs = 50 }) {
  if (typeof contains !== 'string' || contains.length === 0) {
    throw new Error('waitForText requires a non-empty `contains` string');
  }
  const start = nowMs();
  while (nowMs() - start < timeoutMs) {
    const text = stripAnsi(termToPlainText(term));
    if (text.includes(contains)) return;
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for text: ${contains}`);
}

async function waitForTextToDisappear({ term, contains, timeoutMs = 15000, pollMs = 50 }) {
  if (typeof contains !== 'string' || contains.length === 0) {
    throw new Error('waitForTextToDisappear requires a non-empty `contains` string');
  }
  const start = nowMs();
  while (nowMs() - start < timeoutMs) {
    const text = stripAnsi(termToPlainText(term));
    if (!text.includes(contains)) return;
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for text to disappear: ${contains}`);
}

async function waitForAnyText({ term, containsAny, timeoutMs = 15000, pollMs = 50 }) {
  if (!Array.isArray(containsAny) || containsAny.length === 0) {
    throw new Error('waitForAnyText requires a non-empty `containsAny` array');
  }
  const needles = containsAny.filter((s) => typeof s === 'string' && s.length > 0);
  if (needles.length === 0) {
    throw new Error('waitForAnyText requires at least one non-empty string needle');
  }

  const start = nowMs();
  while (nowMs() - start < timeoutMs) {
    const text = stripAnsi(termToPlainText(term));
    for (const needle of needles) {
      if (text.includes(needle)) return needle;
    }
    await sleep(pollMs);
  }

  throw new Error(`Timed out waiting for any text: ${needles.join(', ')}`);
}


function sendKeys(child, keys) {
  child.write(keys);
}

function sendLine(child, line) {
  // node-pty expects actual control characters, not the two-character string "\\r".
  child.write(line + '\r');
}




function waitForExit(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for process exit after ${timeoutMs}ms`));
    }, timeoutMs);

    child.onExit(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function runApp({
  name,
  command,
  args,
  cwd,
  env,
  forwardTerminalResponses = true,
}) {
  const cols = 100;
  const rows = 30;

  const term = new Terminal({ cols, rows, allowProposedApi: true });
  term.write('\u001b[?25h'); // ensure cursor visible if supported

  let childClosed = false;

  const child = pty.spawn(command, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      // Some TUIs depend on this to decide whether to enable readline-style features.
      TERM_PROGRAM: 'tuimuppet',
      ...(env ?? {}),
    },
  });

  // Forward terminal response sequences (e.g., CPR/DA) back to the app.
  // This is required for prompt_toolkit (code-puppy interactive).
  // It can also interfere with other TUIs, so it's configurable per app.
  if (forwardTerminalResponses) {
    term.onData((data) => {
      if (childClosed) return;
      try {
        child.write(data);
      } catch {
        // ignore
      }
    });
  }

  let transcript = '';
  child.onData((data) => {
    term.write(data);
    transcript += data;
    if (transcript.length > 2_000_000) {
      transcript = transcript.slice(-1_000_000);
    }
  });

  child.onExit(() => {
    childClosed = true;
  });

  const dumpState = (label) => {
    const screen = termToPlainText(term);
    const cursor = getCursor(term);
    process.stdout.write(
      `\n--- ${name} ${label} ---\ncursor: ${cursor.x},${cursor.y}\n${redactSecrets(screen)}\n--- end ---\n`,
    );
  };

  const dumpSnapshotJson = (label) => {
    const snap = snapshotToJson(term);
    process.stdout.write(
      `\n--- ${name} ${label} snapshot.json ---\n${JSON.stringify(snap)}\n--- end ---\n`,
    );
  };

  const dumpTranscriptTail = (label, maxChars = 4000) => {
    const tail = transcript.slice(-maxChars);
    process.stdout.write(
      `\n--- ${name} ${label} transcript tail ---\n${redactSecrets(tail)}\n--- end ---\n`,
    );
  };

  const stop = async () => {
    childClosed = true;
    try {
      child.kill();
    } catch {
      // ignore
    }
  };

  return {
    term,
    child,
    transcript: () => transcript,
    dumpState,
    dumpSnapshotJson,
    dumpTranscriptTail,
    stop,
  };
}

async function driveLlxprt({ repoRoot, syntheticKeyPath }) {
  const { term, child, dumpState, dumpTranscriptTail, stop, dumpSnapshotJson } =
    await runApp({
      name: 'llxprt',
      command: 'node',
      args: ['scripts/start.js', '--profile-load', 'synthetic', '--keyfile', syntheticKeyPath],
      cwd: repoRoot,
      // For determinism, emulate a real terminal as closely as possible.
      forwardTerminalResponses: true,
    });

  async function quitGracefully() {
    // Only quit once we're clearly back at the interactive prompt.
    await waitForText({ term, contains: '>>>', timeoutMs: 60000 });
    await sleep(100);

    // code-puppy advertises both `/exit` and `/quit`, but in practice it accepts `/exit`.
    sendLine(child, '/exit');

    // Prove we left interactive mode by waiting for the prompt to disappear.
    try {
      await waitForTextToDisappear({ term, contains: '>>>', timeoutMs: 3000 });
    } catch {
      // Retry once; if it still doesn't disappear, treat as quit-not-accepted.
      sendLine(child, '/exit');
      await waitForTextToDisappear({ term, contains: '>>>', timeoutMs: 3000 });
    }

    await waitForExit(child, 5000);
  }

  try {
    // Wait for interactive prompt.
    try {
      await waitForText({ term, contains: '>>>', timeoutMs: 60000 });
      await stableFor({ term, durationMs: 1500 });
      await sleep(250);
    } catch {
      dumpState('timeout-waiting-prompt');
      dumpTranscriptTail('timeout-waiting-prompt');
      throw new Error('code-puppy did not reach interactive prompt within timeout');
    }

    // Avoid any marker text we might type (it can be echoed at the prompt).
    const codePuppyPrompt = 'Write me a haiku and include the word "mouth" exactly once.';
    sendLine(child, codePuppyPrompt);

    try {
      // code-puppy prints a stable prefix for the agent's answer.
      await waitForText({ term, contains: 'AGENT RESPONSE', timeoutMs: 180000 });
      // The prompt is present in the terminal transcript even when it's not rendered
      // on-screen (prompt_toolkit cursor positioning / clears). Treat transcript as
      // authoritative for this particular prompt.
      const transcriptNeedle = '>>> ';
      const start = nowMs();
      while (nowMs() - start < 180000) {
        if (stripAnsi(transcript()).includes(transcriptNeedle)) break;
        await sleep(50);
      }
      if (!stripAnsi(transcript()).includes(transcriptNeedle)) {
        throw new Error('Timed out waiting for code-puppy prompt in transcript');
      }
    } catch {
      dumpState('timeout-waiting-marker');
      dumpTranscriptTail('timeout-waiting-marker');
      throw new Error('code-puppy did not appear to complete a response within timeout');
    }

    // Wait for prompt to come back.
    try {
      await waitForText({ term, contains: '>>>', timeoutMs: 180000 });
    } catch {
      dumpState('timeout-waiting-finish');
      dumpTranscriptTail('timeout-waiting-finish');
      throw new Error('code-puppy did not return to prompt within timeout');
    }

    dumpState('after-haiku');
    dumpSnapshotJson('after-haiku');

    try {
      await quitGracefully();
    } catch {
      dumpState('code_puppy-exit-timeout-nonfatal');
      dumpTranscriptTail('code_puppy-exit-timeout-nonfatal');
    }
  } finally {
    await stop();
  }
}

function repoRootFromScriptLocation() {
  // We want this prototype to work regardless of CWD.
  // Current file: tuimuppet/prototypes/pty_smoke.mjs
  // Repo root we want: ../llxprt-code (sibling to tuimuppet/)
  const __filename = new URL(import.meta.url).pathname;
  const __dirname = path.dirname(__filename);
  const tuimuppetRoot = path.resolve(__dirname, '..');
  return path.resolve(tuimuppetRoot, '..', 'llxprt-code');
}

async function main() {
  const repoRoot = repoRootFromScriptLocation();
  const home = getHome();
  const syntheticProfile = path.join(home, '.llxprt', 'profiles', 'synthetic.json');
  const syntheticKey = path.join(home, '.synthetic_key');

  process.stdout.write(`Using llxprt repo: ${repoRoot}\n`);
  process.stdout.write(`Expecting profile: ${syntheticProfile}\n`);
  process.stdout.write(`Expecting key: ${syntheticKey}\n`);

  await driveLlxprt({ repoRoot, syntheticKeyPath: syntheticKey });

  await driveCodePuppy({ syntheticKeyPath: syntheticKey });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
