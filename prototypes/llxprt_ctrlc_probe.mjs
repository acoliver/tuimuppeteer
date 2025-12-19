#!/usr/bin/env node
/*
  Spawn llxprt under node-pty, wait until idle, then double-tap Ctrl-C.
  Goal: see whether llxprt exits and/or prints shutdown text when interrupted.
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

function termToPlainText(term) {
  const buf = term.buffer.active;
  const lines = [];
  for (let y = 0; y < term.rows; y += 1) {
    const line = buf.getLine(y);
    lines.push(line ? line.translateToString(true) : '');
  }
  return lines.join('\n');
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
  await sleep(250);

  process.stdout.write('Double-tapping Ctrl-C...\n');
  const start = nowMs();
  child.write('\x03');
  await sleep(120);
  child.write('\x03');

  const exit = await Promise.race([
    exitPromise,
    (async () => {
      await sleep(2000);
      return null;
    })(),
  ]);

  const elapsed = nowMs() - start;
  const screen = stripAnsi(termToPlainText(term));
  const tail = stripAnsi(transcript.slice(-4000));

  process.stdout.write(`Elapsed: ${elapsed}ms\n`);
  process.stdout.write(`Exited: ${exit ? 'yes' : 'no'}\n`);
  if (exit) process.stdout.write(`Exit event: ${JSON.stringify(exit)}\n`);

  const hasShutdownText = screen.includes('agent powering down') || tail.includes('agent powering down');
  process.stdout.write(`Saw 'agent powering down': ${hasShutdownText ? 'yes' : 'no'}\n`);

  if (!exit) {
    // Ensure we don't leave it running.
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      process.kill(child.pid, 'SIGKILL');
    }
    const forced = await exitPromise;
    process.stdout.write(`Forced kill exit event: ${JSON.stringify(forced)}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
