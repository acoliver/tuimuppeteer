import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');

function loadPackageJson(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>;
}

describe('packaging', () => {
  it('exposes bun-first cli entrypoint', () => {
    const pkg = loadPackageJson();
    const bin = pkg.bin as Record<string, string> | undefined;
    const exportsField = pkg.exports as Record<string, unknown> | undefined;

    expect(bin?.tuimuppeteer).toBe('src/cli/main.ts');
    expect(exportsField?.['./cli']).toBeDefined();

    const cliPath = path.join(projectRoot, 'src', 'cli', 'main.ts');
    expect(fs.existsSync(cliPath)).toBe(true);
  });

  it('keeps Bun-first entry in exports', () => {
    const pkg = loadPackageJson();
    const exportsField = pkg.exports as Record<string, unknown> | undefined;
    const rootExport = exportsField?.['.'] as Record<string, string> | undefined;

    expect(rootExport?.bun).toBe('./src/index.ts');
    expect(rootExport?.import).toBe('./src/index.ts');
  });
});
