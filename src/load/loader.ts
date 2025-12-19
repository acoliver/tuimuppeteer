import type { z } from 'zod';
import {
  macroFileSchema,
  scenarioSchema,
  sequenceSchema,
  stepSchema,
} from '../schema/schema.js';

type MacroFile = z.infer<typeof macroFileSchema>;
type Sequence = z.infer<typeof sequenceSchema>;
type Scenario = z.infer<typeof scenarioSchema>;
type Step = z.infer<typeof stepSchema>;

type MacroLibrary = Record<string, Step[]>;

function assertUniqueNames(names: string[], label: string) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
  }
  if (duplicates.size > 0) {
    throw new Error(
      `${label} contains duplicate names: ${Array.from(duplicates).join(', ')}`,
    );
  }
}

function parseMacroFile(raw: unknown): MacroFile {
  return macroFileSchema.parse(raw);
}

function parseSequence(raw: unknown): Sequence {
  return sequenceSchema.parse(raw);
}

function parseScenario(raw: unknown): Scenario {
  return scenarioSchema.parse(raw);
}

function mergeMacros(files: MacroFile[]): MacroLibrary {
  const merged: MacroLibrary = {};
  for (const file of files) {
    for (const [name, steps] of Object.entries(file.macros)) {
      if (name in merged) {
        throw new Error(`Macro "${name}" already defined`);
      }
      merged[name] = steps;
    }
  }
  return merged;
}

function applyMacroArgs(value: unknown, args: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const exact = /^\$\{(\w+)\}$/.exec(value);
    if (exact !== null) {
      const key = exact[1];
      if (Object.prototype.hasOwnProperty.call(args, key)) {
        return args[key];
      }
    }
    return value.replace(/\$\{(\w+)\}/g, (match, key: string) => {
      if (!Object.prototype.hasOwnProperty.call(args, key)) return match;
      return String(args[key]);
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => applyMacroArgs(item, args));
  }

  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = applyMacroArgs(item, args);
    }
    return output;
  }

  return value;
}

function expandMacroSteps(
  steps: Step[],
  macros: MacroLibrary,
  stack: string[] = [],
): Step[] {
  const output: Step[] = [];
  for (const step of steps) {
    if (step.type !== 'macro') {
      output.push(step);
      continue;
    }
    const name = step.name;
    if (!(name in macros)) {
      throw new Error(`Macro "${name}" not found`);
    }
    if (stack.includes(name)) {
      throw new Error(`Macro cycle detected: ${[...stack, name].join(' -> ')}`);
    }
    const args =
      step.args && typeof step.args === 'object' && !Array.isArray(step.args)
        ? step.args
        : {};
    const template = macros[name];
    const expandedTemplate = expandMacroSteps(template, macros, [...stack, name]);
    for (const templateStep of expandedTemplate) {
      const cloned = applyMacroArgs(
        JSON.parse(JSON.stringify(templateStep)),
        args,
      );
      output.push(stepSchema.parse(cloned));
    }
  }
  return output;
}

function buildSequenceIndex(sequences: Sequence[]) {
  assertUniqueNames(
    sequences.map((sequence) => sequence.name),
    'sequences',
  );
  const index = new Map<string, Sequence>();
  for (const sequence of sequences) {
    index.set(sequence.name, sequence);
  }
  return index;
}

function buildScenarioIndex(scenarios: Scenario[]) {
  assertUniqueNames(
    scenarios.map((scenario) => scenario.name),
    'scenarios',
  );
  const index = new Map<string, Scenario>();
  for (const scenario of scenarios) {
    index.set(scenario.name, scenario);
  }
  return index;
}

export {
  applyMacroArgs,
  buildScenarioIndex,
  buildSequenceIndex,
  expandMacroSteps,
  mergeMacros,
  parseMacroFile,
  parseScenario,
  parseSequence,
};

export type { MacroFile, MacroLibrary, Scenario, Sequence, Step };
