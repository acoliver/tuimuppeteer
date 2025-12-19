#!/usr/bin/env node
/*
  Spawn llxprt under node-pty and force-kill it after it reaches the prompt.
  This verifies the harness can reliably observe process exit (onExit) even if
  the app doesn't quit cleanly.
*/

import os from 'node:os';
import path from 'node:path';

import xtermHeadless from '@xterm/headless';
import pty from 'node-pty';

const { Terminal } = xtermHeadless;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nowMs() {
  return Date.now();
}

function stripAnsi(text) {
  return text
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b/g, '');
}

async function waitForText({ term, contains, timeoutMs = 15000, pollMs = 50 }) {
  const start = nowMs();
  while (nowMs() - start < timeoutMs) {
    const text = stripAnsi(termToPlainText(term));
    if (text.includes(contains)) return;
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for text: ${contains}`);
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

function repoRootFromScriptLocation() {
  const __filename = new URL(import.meta.url).pathname;
  const __dirname = path.dirname(__filename);
  const tuimuppeteerRoot = path.resolve(__dirname, '..');
  return path.resolve(tuimuppeteerRoot, '..', 'llxprt-code');
}

async function main() {
  const cols = 100;
  const rows = 30;

  const term = new Terminal({ cols, rows, allowProposedApi: true });
  term.write('\u001b[?25h');

  const repoRoot = repoRootFromScriptLocation();
  const syntheticKey = path.join(os.homedir(), '.synthetic_key');

  const child = pty.spawn(
    'node',
    ['scripts/start.js', '--profile-load', 'synthetic', '--keyfile', syntheticKey],
    {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: repoRoot,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        TERM_PROGRAM: 'tuimuppeteer',
      },
    },
  );

  let transcript = '';
  child.onData((data) => {
    term.write(data);
    transcript += data;
    if (transcript.length > 1_000_000) transcript = transcript.slice(-500_000);
  });

  const exitPromise = new Promise((resolve) => {
    child.onExit((e) => resolve(e));
  });

  await waitForText({ term, contains: 'Type your message', timeoutMs: 60000 });

  // Force-kill: we prefer killing the process group if possible.
  const pid = child.pid;
  const start = nowMs();
  process.stdout.write(`llxprt pid: ${pid}\n`);

  try {
    process.kill(-pid, 'SIGKILL');
    process.stdout.write('Sent SIGKILL to process group.\n');
  } catch {
    process.kill(pid, 'SIGKILL');
    process.stdout.write('Sent SIGKILL to pid (group kill failed).\n');
  }

  const exit = await Promise.race([
    exitPromise,
    (async () => {
      await sleep(2000);
      throw new Error('Timed out waiting for onExit after kill');
    })(),
  ]);

  const elapsed = nowMs() - start;
  process.stdout.write(`onExit observed after ${elapsed}ms: ${JSON.stringify(exit)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
