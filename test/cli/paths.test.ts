import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { resolveScenarioPaths } from '../../src/cli/paths.js';

describe('cli paths', () => {
  it('resolves sibling directories for macros and sequences', () => {
    const scenarioPath = path.join('fixtures', 'scenario.json');
    const resolved = resolveScenarioPaths(scenarioPath);

    expect(resolved.scenarioPath).toContain(path.join('fixtures', 'scenario.json'));
    expect(resolved.macrosDir).toContain(path.join('fixtures', 'macros'));
    expect(resolved.sequencesDir).toContain(path.join('fixtures', 'sequences'));
  });
});
