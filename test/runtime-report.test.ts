import { describe, expect, it } from 'vitest';
import { createReport } from '../src/runtime/report.js';

describe('report generation', () => {
  it('marks report failed when any sequence fails', () => {
    const sequences = [
      {
        name: 'login',
        status: 'passed' as const,
        durationMs: 10,
        steps: [],
        artifacts: [],
      },
      {
        name: 'haiku',
        status: 'failed' as const,
        durationMs: 20,
        steps: [],
        artifacts: [],
      },
    ];

    const report = createReport('basic', sequences);
    expect(report.status).toBe('failed');
    expect(report.scenario).toBe('basic');
    expect(report.sequences).toHaveLength(2);
  });

  it('marks report passed when all sequences pass', () => {
    const sequences = [
      {
        name: 'login',
        status: 'passed' as const,
        durationMs: 10,
        steps: [],
        artifacts: [],
      },
    ];

    const report = createReport('basic', sequences);
    expect(report.status).toBe('passed');
    expect(report.sequences).toHaveLength(1);
  });
});
