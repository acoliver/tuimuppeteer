import type { RunPlan, RunReport, SequenceResult } from './types.js';
import { createReport } from './report.js';

function runPlan(plan: RunPlan): RunReport {
  const sequences: SequenceResult[] = plan.sequences.map((sequence) => ({
    name: sequence.name,
    status: 'passed',
    durationMs: 0,
    steps: [],
    artifacts: [],
  }));

  return createReport(plan.scenario.name, sequences);
}

export { runPlan };
