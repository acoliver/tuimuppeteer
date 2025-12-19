#!/usr/bin/env bun
import { parseArgs } from './args.js';
import { runFromOptions } from './runner.js';

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  await runFromOptions(options);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
