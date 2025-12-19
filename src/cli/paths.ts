import path from 'node:path';

interface ScenarioPaths {
  scenarioPath: string;
  rootDir: string;
  macrosDir: string;
  sequencesDir: string;
}

function resolveScenarioPaths(scenarioPath: string): ScenarioPaths {
  const absolute = path.resolve(scenarioPath);
  const rootDir = path.dirname(absolute);
  return {
    scenarioPath: absolute,
    rootDir,
    macrosDir: path.join(rootDir, 'macros'),
    sequencesDir: path.join(rootDir, 'sequences'),
  };
}

export type { ScenarioPaths };
export { resolveScenarioPaths };
