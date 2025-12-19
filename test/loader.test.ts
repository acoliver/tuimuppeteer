import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildScenarioIndex,
  buildSequenceIndex,
  expandMacroSteps,
  mergeMacros,
  parseMacroFile,
  parseScenario,
  parseSequence,
} from '../src/load/loader.js';

function loadFixture(name: string): unknown {
  const filePath = path.resolve(__dirname, 'fixtures', name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

describe('loader helpers', () => {
  it('merges macros and expands them', () => {
    const macroFile = parseMacroFile(loadFixture('macros.json'));
    const macros = mergeMacros([macroFile]);

    const sequence = parseSequence(loadFixture('sequence-login.json'));
    const expanded = expandMacroSteps(sequence.steps, macros);

    const types = expanded.map((step) => step.type);
    expect(types).toStrictEqual(['waitFor', 'line', 'line', 'waitFor']);
    const [usernameStep, passwordStep] = expanded.filter(
      (step) => step.type === 'line',
    );
    expect(usernameStep.text).toBe('alice');
    expect(passwordStep.text).toBe('secret');
  });

  it('detects macro cycles', () => {
    const macroFile = parseMacroFile({
      schemaVersion: 'v1',
      macros: {
        a: [{ type: 'macro', name: 'b' }],
        b: [{ type: 'macro', name: 'a' }],
      },
    });
    const macros = mergeMacros([macroFile]);
    const sequence = parseSequence({
      schemaVersion: 'v1',
      name: 'cycle',
      steps: [{ type: 'macro', name: 'a' }],
    });

    expect(() => expandMacroSteps(sequence.steps, macros)).toThrow(
      'Macro cycle detected: a -> b -> a',
    );
  });

  it('rejects duplicate macro names across files', () => {
    const macroFile = parseMacroFile(loadFixture('macros.json'));
    const macroConflict = parseMacroFile(loadFixture('macro-conflict.json'));
    expect(() => mergeMacros([macroFile, macroConflict])).toThrow(
      'Macro "login" already defined',
    );
  });

  it('builds scenario and sequence indexes', () => {
    const sequence = parseSequence(loadFixture('sequence-login.json'));
    const scenario = parseScenario(loadFixture('scenario-basic.json'));

    const sequenceIndex = buildSequenceIndex([sequence]);
    const scenarioIndex = buildScenarioIndex([scenario]);

    expect(sequenceIndex.get('login')?.name).toBe('login');
    expect(scenarioIndex.get('basic')?.name).toBe('basic');
  });

  it('rejects duplicate names', () => {
    const sequence = parseSequence(loadFixture('sequence-login.json'));
    expect(() => buildSequenceIndex([sequence, sequence])).toThrow(
      'sequences contains duplicate names: login',
    );
  });
});
