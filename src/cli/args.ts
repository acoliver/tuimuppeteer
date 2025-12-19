interface RunOptions {
  scenarioPath?: string;
  sequenceName?: string;
  report?: string;
  capturesDir?: string;
}

function parseArgs(argv: string[]): RunOptions {
  const args = argv.slice(2);
  const options: RunOptions = {};

  let index = 0;
  while (index < args.length) {
    const value = args[index];
    if (!value) {
      index += 1;
      continue;
    }
    if (value === '--scenario') {
      options.scenarioPath = args[index + 1];
      index += 2;
      continue;
    }
    if (value === '--sequence') {
      options.sequenceName = args[index + 1];
      index += 2;
      continue;
    }
    if (value === '--report') {
      options.report = args[index + 1];
      index += 2;
      continue;
    }
    if (value === '--captures') {
      options.capturesDir = args[index + 1];
      index += 2;
      continue;
    }
    index += 1;
  }

  return options;
}

export type { RunOptions };
export { parseArgs };
