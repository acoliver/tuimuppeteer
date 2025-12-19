import type { RunPlan, Scenario, Sequence } from './types.js';

function buildRunPlan(scenario: Scenario, sequences: Sequence[]): RunPlan {
  const order = scenario.sequenceOrder;
  const sequenceMap = new Map(sequences.map((sequence) => [sequence.name, sequence]));
  const ordered: Sequence[] = [];

  for (const name of order) {
    const sequence = sequenceMap.get(name);
    if (!sequence) {
      throw new Error(`Scenario references missing sequence: ${name}`);
    }
    ordered.push(sequence);
  }

  return { scenario, sequences: ordered };
}

export { buildRunPlan };
