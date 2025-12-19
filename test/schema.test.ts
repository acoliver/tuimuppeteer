import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  macroFileSchema,
  scenarioSchema,
  sequenceSchema,
} from '../src/schema/schema.js';

function loadFixture(name: string): unknown {
  const filePath = path.resolve(__dirname, 'fixtures', name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

describe('schema validation', () => {
  it('accepts macro fixtures', () => {
    const data = loadFixture('macros.json');
    expect(() => macroFileSchema.parse(data)).not.toThrow();
  });

  it('accepts scenario fixtures', () => {
    const data = loadFixture('scenario-basic.json');
    expect(() => scenarioSchema.parse(data)).not.toThrow();
  });

  it('accepts sequence fixtures', () => {
    const data = loadFixture('sequence-login.json');
    expect(() => sequenceSchema.parse(data)).not.toThrow();
  });

  it('rejects invalid macros', () => {
    const data = loadFixture('macro-invalid.json');
    expect(() => macroFileSchema.parse(data)).toThrow('Invalid input');
  });

  it('rejects invalid sequences', () => {
    const data = loadFixture('sequence-invalid.json');
    expect(() => sequenceSchema.parse(data)).toThrow('Matcher requires contains or regex');
  });
});
