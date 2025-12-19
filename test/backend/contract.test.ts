import { describe, expect, it } from 'vitest';
import { FakeBackend } from '../../src/runtime/fake-backend.js';

describe('backend contract', () => {
  it('supports launch, output capture, and exit flow', async () => {
    const backend = new FakeBackend({ initialScreen: 'Ready', exitAfterLines: ['quit'] });
    await backend.launch();

    await expect(backend.isRunning()).resolves.toBe(true);

    await backend.sendLine('hello');
    const screen = await backend.captureScreen();
    expect(screen).toContain('hello');

    await backend.sendLine('quit');
    await backend.waitForExit(200);
  });

  it('supports resize and scrollback capture', async () => {
    const backend = new FakeBackend({ initialScreen: 'Ready' });
    await backend.launch();
    await backend.resize(90, 30);
    expect(backend.getSize()).toStrictEqual({ cols: 90, rows: 30 });

    await backend.sendLine('alpha');
    await backend.sendLine('beta');
    const scrollback = await backend.captureScrollback(1);
    expect(scrollback).toBe('beta');
  });
});
