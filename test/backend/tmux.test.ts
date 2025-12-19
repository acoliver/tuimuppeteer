import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { TmuxBackend } from '../../src/backend/tmux.js';

const harnessPath = path.resolve(
  __dirname,
  '..',
  'harness',
  'echo-app.sh',
);

describe('tmux backend', () => {
  it('launches, sends input, captures, and exits', async () => {
    const backend = new TmuxBackend('tuimuppeteer_test');
    try {
      const { pid } = await backend.launch(harnessPath, [], process.cwd());

      await expect(backend.isRunning(pid)).resolves.toBe(true);

      await backend.waitForOutput('Ready>', 5000);
      await backend.sendLine('hello');
      await backend.waitForOutput('Echo: hello', 5000);

      const screen = await backend.captureScreen();
      expect(screen).toContain('Ready>');
      expect(screen).toContain('Echo: hello');

      await backend.sendLine('quit');
      await backend.waitForExit(5000);
    } finally {
      await backend.destroy();
    }
  });

  it('throws when actions are invoked before launch', async () => {
    const backend = new TmuxBackend('tuimuppeteer_test');
    await expect(backend.captureScreen()).rejects.toThrow('tmux session not started');
    await backend.destroy();
  });

  it('captures scrollback output', async () => {
    const backend = new TmuxBackend('tuimuppeteer_test');
    try {
      await backend.launch(harnessPath, [], process.cwd());
      await backend.waitForOutput('Ready>', 5000);
      await backend.sendLine('hello');
      await backend.waitForOutput('Echo: hello', 5000);

      const scrollback = await backend.captureScrollback(50);
      expect(scrollback).toContain('Echo: hello');

      await backend.sendLine('quit');
      await backend.waitForExit(5000);
    } finally {
      await backend.destroy();
    }
  });
});
