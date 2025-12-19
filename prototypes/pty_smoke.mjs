#!/usr/bin/env node
/*
  PTY smoke prototype:
  - Spawns a command in a PTY (node-pty)
  - Feeds output into @xterm/headless to maintain a terminal grid + cursor
  - Records a raw PTY transcript to make output-only assertions

  Notes on reliability:
  - Terminal UIs often use cursor-motion + rewrite-in-place sequences. If you
    dump the raw output as plain text, spinners can look like many lines.
  - xterm/headless is useful for snapshots but should not be the sole oracle.

  This is a prototype harness.
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
  const home = os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .replace(new RegExp(home, 'g'), '~')
    .replace(/\.synthetic_key/g, '[REDACTED_KEYFILE]')
    .replace(/syn_[A-Za-z0-9_\-]{8,}/g, '[REDACTED_SYN_KEY]');
}

function stripAnsi(text) {
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

async function waitForExit(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for process exit after ${timeoutMs}ms`));
    }, timeoutMs);

    child.onExit((e) => {
      clearTimeout(timer);
      resolve(e);
    });
  });
}

function sendLine(child, line) {
  child.write(line + '\r');
}

function readKeyfileTrimmed(keyfilePath) {
  return fs.readFileSync(keyfilePath, 'utf8').trim();
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
  term.write('\u001b[?25h');

  let childClosed = false;

  const child = pty.spawn(command, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      TERM_PROGRAM: 'tuimuppeteer',
      ...(env ?? {}),
    },
  });

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

  const getTranscript = () => transcript;

  return {
    term,
    child,
    getTranscript,
    dumpState,
    dumpSnapshotJson,
    dumpTranscriptTail,
    stop,
  };
}

async function waitForTranscript({ getTranscript, contains, timeoutMs = 15000, pollMs = 50 }) {
  if (typeof contains !== 'string' || contains.length === 0) {
    throw new Error('waitForTranscript requires a non-empty `contains` string');
  }
  const start = nowMs();
  while (nowMs() - start < timeoutMs) {
    if (stripAnsi(getTranscript()).includes(contains)) return;
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for transcript text: ${contains}`);
}

async function driveLlxprt({ repoRoot, syntheticKeyPath }) {
  const { term, child, getTranscript, dumpState, dumpTranscriptTail, stop, dumpSnapshotJson } =
    await runApp({
      name: 'llxprt',
      command: 'node',
      args: ['scripts/start.js', '--profile-load', 'synthetic', '--keyfile', syntheticKeyPath],
      cwd: repoRoot,
      forwardTerminalResponses: true,
    });

  try {
    await waitForText({ term, contains: 'Type your message', timeoutMs: 60000 });
    await stableFor({ term, durationMs: 1500 });
    await sleep(250);

    // Output-only completion: require the assistant output marker (the star prefix)
    // and that we return to the input prompt afterwards.
    sendLine(child, 'Write me a haiku and include the word "mouth" exactly once.');

    await waitForTranscript({ getTranscript, contains: '\n ', timeoutMs: 180000 });
    await waitForText({ term, contains: 'Type your message', timeoutMs: 180000 });

    dumpState('after-haiku');
    dumpSnapshotJson('after-haiku');

    // Deterministic /quit: require shutdown text + actual process exit.
    // (No fallback kill on the success path.)
    const quitStart = nowMs();
    sendLine(child, '/quit');

    // The shutdown text appears in the rendered TUI. In practice the raw transcript
    // may not contain it (alternate screen/cursor movements), so check both oracles.
    await waitForText({ term, contains: 'agent powering down', timeoutMs: 5000 });
    await waitForExit(child, 1500);

    const quitElapsed = nowMs() - quitStart;
    if (quitElapsed > 1500) {
      throw new Error(`LLXPRT quit exceeded 1500ms (${quitElapsed}ms)`);
    }
  } catch (err) {
    dumpState('error');
    dumpTranscriptTail('error');
    throw err;
  } finally {
    await stop();
  }
}

async function driveCodePuppy({ syntheticKeyPath }) {
  const synApiKey = readKeyfileTrimmed(syntheticKeyPath);

  const { term, child, getTranscript, dumpState, dumpTranscriptTail, stop, dumpSnapshotJson } =
    await runApp({
      name: 'code_puppy',
      command: 'code-puppy',
      args: ['--interactive'],
      cwd: process.cwd(),
      env: {
        SYN_API_KEY: synApiKey,
      },
      forwardTerminalResponses: true,
    });

  try {
    // prompt_toolkit prompt may not reliably render into the grid; use transcript.
    await waitForTranscript({ getTranscript, contains: '>>>', timeoutMs: 60000 });
    await stableFor({ term, durationMs: 1500 });
    await sleep(250);

    sendLine(child, 'Write me a haiku and include the word "mouth" exactly once.');

    await waitForTranscript({ getTranscript, contains: 'AGENT RESPONSE', timeoutMs: 180000 });
    await waitForTranscript({ getTranscript, contains: '>>>', timeoutMs: 180000 });

    dumpState('after-haiku');
    dumpSnapshotJson('after-haiku');

    sendLine(child, '/exit');
    await waitForExit(child, 5000);
  } catch (err) {
    dumpState('error');
    dumpTranscriptTail('error');
    throw err;
  } finally {
    await stop();
  }
}

function repoRootFromScriptLocation() {
  const __filename = new URL(import.meta.url).pathname;
  const __dirname = path.dirname(__filename);
  const tuimuppeteerRoot = path.resolve(__dirname, '..');
  return path.resolve(tuimuppeteerRoot, '..', 'llxprt-code');
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
