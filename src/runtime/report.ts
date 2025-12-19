import type { RunReport, SequenceResult } from './types.js';

function createReport(scenarioName: string, sequences: SequenceResult[]): RunReport {
  const startedAt = new Date().toISOString();
  const finishedAt = new Date().toISOString();
  const status = sequences.some((sequence) => sequence.status === 'failed')
    ? 'failed'
    : 'passed';

  return {
    schemaVersion: 'v1',
    scenario: scenarioName,
    startedAt,
    finishedAt,
    status,
    sequences,
  };
}

export { createReport };
