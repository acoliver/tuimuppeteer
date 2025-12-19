import fs from 'node:fs';
import path from 'node:path';

function readJson<T = unknown>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

function readJsonFiles<T = unknown>(dirPath: string): T[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  const entries = fs
    .readdirSync(dirPath)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(dirPath, name));

  return entries.map((entry) => readJson<T>(entry));
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export { ensureDir, readJson, readJsonFiles };
