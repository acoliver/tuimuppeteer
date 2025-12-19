import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, readJsonFiles } from '../../src/cli/io.js';

describe('cli io', () => {
  const tempDir = path.join(__dirname, 'tmp');

  it('creates directories when missing', () => {
    fs.rmSync(tempDir, { recursive: true, force: true });

    ensureDir(tempDir);
    expect(fs.existsSync(tempDir)).toBe(true);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty list for missing directory', () => {
    const missing = path.join(__dirname, 'missing');
    const files = readJsonFiles(missing);
    expect(files).toStrictEqual([]);
  });
});
