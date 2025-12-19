import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildRunPlan } from '../src/runtime/plan.js';
import { parseScenario, parseSequence } from '../src/load/loader.js';

function loadFixture(name: string): unknown {
  const filePath = path.resolve(__dirname, 'fixtures', name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

describe('run plan', () => {
  it('orders sequences by scenario sequenceOrder', () => {
    const scenario = parseScenario(loadFixture('scenario-basic.json'));
    const login = parseSequence(loadFixture('sequence-login.json'));
    const ready = parseSequence({
      schemaVersion: 'v1',
      name: 'app-ready',
      steps: [{ type: 'waitFor', contains: 'Ready' }],
    });

    const plan = buildRunPlan(scenario, [login, ready]);
    expect(plan.sequences.map((seq) => seq.name)).toStrictEqual([
      'app-ready',
      'login',
    ]);
  });

  it('throws when scenario references missing sequence', () => {
    const scenario = parseScenario(loadFixture('scenario-basic.json'));
    const login = parseSequence(loadFixture('sequence-login.json'));

    expect(() => buildRunPlan(scenario, [login])).toThrow(
      'Scenario references missing sequence: app-ready',
    );
  });
});
