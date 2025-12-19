import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/cli/args.js';

describe('cli args', () => {
  it('parses scenario and output options', () => {
    const options = parseArgs([
      'node',
      'cli.js',
      '--scenario',
      'scenario.json',
      '--sequence',
      'login',
      '--report',
      'report.json',
      '--captures',
      'captures',
    ]);

    expect(options).toStrictEqual({
      scenarioPath: 'scenario.json',
      sequenceName: 'login',
      report: 'report.json',
      capturesDir: 'captures',
    });
  });
});
