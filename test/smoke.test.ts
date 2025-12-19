import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

function runEchoApp(input: string) {
  const scriptPath = path.resolve(__dirname, 'harness', 'echo-app.sh');
  const result = spawnSync(scriptPath, {
    input,
    encoding: 'utf8',
  });
  return result;
}

describe('smoke harness', () => {
  it('echoes input and exits on quit', () => {
    const result = runEchoApp('hello\nquit\n');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Ready>');
    expect(result.stdout).toContain('Echo: hello');
    expect(result.stdout).toContain('Bye');
  });
});
