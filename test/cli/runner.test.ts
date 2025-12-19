import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

vi.mock('../../src/backend/tmux.js', async () => {
  const { FakeBackend } = await import('../../src/runtime/fake-backend.js');
  class MockTmuxBackend extends FakeBackend {
    constructor() {
      super({ initialScreen: 'Ready' });
    }
  }
  return { TmuxBackend: MockTmuxBackend };
});

const { runFromOptions } = await import('../../src/cli/runner.js');

const fixtureRoot = path.resolve(__dirname, 'fixtures');
const scenarioPath = path.join(fixtureRoot, 'scenario.json');

describe('cli runner', () => {
  const reportPath = path.join(fixtureRoot, 'report.json');

  beforeEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(reportPath)) {
      fs.unlinkSync(reportPath, { force: true });
    }
  });

  it('emits report to stdout by default', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runFromOptions({ scenarioPath });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('writes report to file when provided', async () => {
    await runFromOptions({ scenarioPath, report: reportPath });

    const content = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as { scenario: string };
    expect(content.scenario).toBe('basic');

    fs.unlinkSync(reportPath);
  });

  it('runs a single sequence when provided', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runFromOptions({ scenarioPath, sequenceName: 'login' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('throws when sequence is missing', async () => {
    await expect(
      runFromOptions({ scenarioPath, sequenceName: 'missing' }),
    ).rejects.toThrow('Sequence not found: missing');
  });
});
