import { describe, expect, it } from 'vitest';
import { reportSchema } from '../src/runtime/report-schema.js';

describe('report schema', () => {
  it('accepts a valid report', () => {
    const report = {
      schemaVersion: 'v1',
      scenario: 'basic',
      startedAt: '2025-12-19T15:30:00Z',
      finishedAt: '2025-12-19T15:31:00Z',
      status: 'passed',
      sequences: [
        {
          name: 'login',
          status: 'passed',
          durationMs: 10,
          steps: [
            {
              id: 'step-1',
              type: 'line',
              status: 'passed',
              durationMs: 5,
              error: null,
            },
          ],
          artifacts: ['./captures/login.txt'],
        },
      ],
    };

    expect(() => reportSchema.parse(report)).not.toThrow();
  });

  it('rejects missing sequence results', () => {
    const report = {
      schemaVersion: 'v1',
      scenario: 'basic',
      startedAt: '2025-12-19T15:30:00Z',
      finishedAt: '2025-12-19T15:31:00Z',
      status: 'passed',
      sequences: [],
    };

    expect(() => reportSchema.parse(report)).toThrow('Too small');
  });
});
