import { describe, expect, it } from 'vitest';
import { runScenario, runStep } from '../src/runtime/executor.js';
import { FakeBackend } from '../src/runtime/fake-backend.js';

const scenario = {
  name: 'basic',
  launch: {
    command: './start.sh',
    args: [],
    cwd: '.',
  },
  sequenceOrder: ['login', 'verify'],
  defaults: {
    waitTimeoutMs: 200,
    pollMs: 10,
    scrollbackLines: 50,
    postTypeMs: 0,
  },
} as const;

describe('executor', () => {
  it('runs sequences in order and stops on failure', async () => {
    const backend = new FakeBackend({ initialScreen: 'Ready' });
    const sequences = [
      {
        schemaVersion: 'v1',
        name: 'login',
        steps: [
          { type: 'line', text: 'hello' },
          { type: 'expect', contains: 'hello' },
        ],
      },
      {
        schemaVersion: 'v1',
        name: 'verify',
        steps: [{ type: 'expect', contains: 'missing' }],
      },
    ] as const;

    const report = await runScenario(scenario, sequences, [], backend);

    expect(report.status).toBe('failed');
    expect(report.sequences).toHaveLength(2);
    expect(report.sequences[0]?.status).toBe('passed');
    expect(report.sequences[1]?.status).toBe('failed');
  });

  it('waits for ready matcher on launch', async () => {
    const backend = new FakeBackend({ initialScreen: 'Booting...' });
    const readyScenario = {
      ...scenario,
      launch: {
        ...scenario.launch,
        startupTimeoutMs: 200,
        readyMatcher: { contains: 'Ready' },
      },
    } as const;

    const sequences = [
      {
        schemaVersion: 'v1',
        name: 'login',
        steps: [{ type: 'line', text: 'hello' }],
      },
      {
        schemaVersion: 'v1',
        name: 'verify',
        steps: [{ type: 'expect', contains: 'hello' }],
      },
    ] as const;

    const reportPromise = runScenario(readyScenario, sequences, [], backend);

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        backend.setScreen('Ready');
        resolve();
      }, 50);
    });

    const report = await reportPromise;
    expect(report.status).toBe('passed');
  });

  it('runs step actions with fake backend', async () => {
    const backend = new FakeBackend({ initialScreen: 'Ready' });
    const ctx = {
      backend,
      macros: new Map(),
      defaults: {
        waitTimeoutMs: 50,
        pollMs: 10,
        scrollbackLines: 50,
        postTypeMs: 0,
      },
    } as const;

    const lineResult = await runStep({ type: 'line', text: 'abc' }, ctx);
    expect(lineResult.status).toBe('passed');
    expect(backend.getSentLines()).toStrictEqual(['abc']);

    const waitResult = await runStep({ type: 'waitFor', contains: 'abc' }, ctx);
    expect(waitResult.status).toBe('passed');

    const failResult = await runStep({ type: 'expect', contains: 'nope' }, ctx);
    expect(failResult.status).toBe('failed');

    await backend.resize(80, 24);
    expect(backend.getSize()).toStrictEqual({ cols: 80, rows: 24 });
  });
});
