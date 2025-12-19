import fs from 'node:fs';
import path from 'node:path';
import {
  buildScenarioIndex,
  buildSequenceIndex,
  parseMacroFile,
  parseScenario,
  parseSequence,
} from '../load/loader.js';
import { runScenario } from '../runtime/executor.js';
import { reportSchema } from '../runtime/report-schema.js';
import { TmuxBackend } from '../backend/tmux.js';
import type { RunReport, Scenario, Sequence } from '../runtime/types.js';
import { ensureDir, readJson, readJsonFiles } from './io.js';
import { resolveScenarioPaths } from './paths.js';
import type { RunOptions } from './args.js';

async function runFromOptions(options: RunOptions): Promise<RunReport> {
  const scenarioPath = options.scenarioPath;
  if (!scenarioPath) {
    throw new Error('Missing --scenario path');
  }

  const paths = resolveScenarioPaths(scenarioPath);
  const scenario = parseScenario(readJson(paths.scenarioPath));
  const macroFiles = readJsonFiles(paths.macrosDir).map((file) =>
    parseMacroFile(file),
  );
  const sequences = readJsonFiles(paths.sequencesDir).map((file) =>
    parseSequence(file),
  );

  const scenarioIndex = buildScenarioIndex([scenario]);
  const sequenceIndex = buildSequenceIndex(sequences);

  const resolvedScenario = resolveScenario(
    scenarioIndex,
    sequenceIndex,
    options.sequenceName,
  );

  const backend = new TmuxBackend();
  const report = await runScenario(
    resolvedScenario,
    Array.from(sequenceIndex.values()),
    macroFiles,
    backend,
  );

  const parsed = reportSchema.parse(report);
  await emitReport(parsed, resolvedScenario, options);

  return parsed;
}

function resolveScenario(
  scenarioIndex: Map<string, Scenario>,
  sequenceIndex: Map<string, Sequence>,
  sequenceName?: string,
): Scenario {
  const scenarios = Array.from(scenarioIndex.values());
  if (scenarios.length === 0) {
    throw new Error('No scenarios loaded');
  }
  const scenario = scenarios[0];
  if (!sequenceName) {
    return scenario;
  }
  const target = sequenceIndex.get(sequenceName);
  if (!target) {
    throw new Error(`Sequence not found: ${sequenceName}`);
  }
  return {
    ...scenario,
    sequenceOrder: [sequenceName],
  };
}

async function emitReport(
  report: RunReport,
  scenario: Scenario,
  options: RunOptions,
): Promise<void> {
  const reportTarget = options.report ?? scenario.artifacts?.report;
  const payload = JSON.stringify(report, null, 2);
  if (!reportTarget || reportTarget === 'stdout') {
    process.stdout.write(`${payload}\n`);
    return;
  }
  const outputPath = path.resolve(reportTarget);
  ensureDir(path.dirname(outputPath));
  await fs.promises.writeFile(outputPath, payload, 'utf8');
}

export { emitReport, resolveScenario, runFromOptions };
