import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

class TmuxBackend {
  private static counter = 0;
  private sessionName: string | null = null;
  private readonly tmuxCommand: string;

  constructor(private readonly sessionPrefix = 'tuimuppeteer') {
    const tmuxPath = process.env.TUIMUPPETEER_TMUX_BIN ?? '/usr/bin/tmux';
    if (!path.isAbsolute(tmuxPath)) {
      throw new Error('TUIMUPPETEER_TMUX_BIN must be an absolute path.');
    }
    if (!fs.existsSync(tmuxPath)) {
      throw new Error(`tmux binary not found at ${tmuxPath}.`);
    }
    this.tmuxCommand = tmuxPath;
  }

  async launch(command: string, args: string[], cwd?: string): Promise<{ pid: number }> {
    const sessionName = `${this.sessionPrefix}_${Date.now().toString(16)}_${TmuxBackend.counter++}`;
    this.sessionName = sessionName;

    try {
      const tmuxArgs = [
        'new-session',
        '-d',
        '-s',
        sessionName,
        ...(cwd ? ['-c', cwd] : []),
        command,
        ...args,
      ];
      this.runTmux(tmuxArgs);

      await this.waitForSession(sessionName, 1500);

      const output = this.runTmux([
        'display-message',
        '-p',
        '-t',
        `${sessionName}:0.0`,
        '#{pane_pid}',
      ]).trim();

      const pid = Number(output);
      if (!Number.isFinite(pid)) {
        throw new Error('Failed to read tmux pane PID');
      }

      return { pid };
    } catch (error) {
      await this.destroy();
      throw error;
    }
  }

  destroy(): Promise<void> {
    if (!this.sessionName) {
      return Promise.resolve();
    }
    try {
      this.runTmux(['kill-session', '-t', this.sessionName]);
    } catch {
      // ignore
    } finally {
      this.sessionName = null;
    }
    return Promise.resolve();
  }



  isRunning(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0);
      return Promise.resolve(true);
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode === 'ESRCH') {
        return Promise.resolve(false);
      }
      if (error instanceof Error) {
        return Promise.reject(error);
      }
      return Promise.reject(new Error('Unknown error checking process state'));
    }
  }

  sendKeys(keys: string[]): Promise<void> {
    this.ensureSession();
    for (const key of keys) {
      this.runTmux(['send-keys', '-t', this.sessionName!, key]);
    }
    return Promise.resolve();
  }

  sendLine(text: string): Promise<void> {
    this.ensureSession();
    this.runTmux(['send-keys', '-t', this.sessionName!, '-l', text]);
    this.runTmux(['send-keys', '-t', this.sessionName!, 'Enter']);
    return Promise.resolve();
  }

  paste(text: string): Promise<void> {
    this.ensureSession();
    this.runTmux(['set-buffer', text]);
    this.runTmux(['paste-buffer', '-t', this.sessionName!]);
    return Promise.resolve();
  }

  resize(cols: number, rows: number): Promise<void> {
    this.ensureSession();
    this.runTmux([
      'resize-window',
      '-t',
      this.sessionName!,
      '-x',
      String(cols),
      '-y',
      String(rows),
    ]);
    return Promise.resolve();
  }

  captureScreen(): Promise<string> {
    try {
      this.ensureSession();
      return Promise.resolve(
        this.runTmux(['capture-pane', '-p', '-t', this.sessionName!]),
      );
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  captureScrollback(lines: number): Promise<string> {
    try {
      this.ensureSession();
      return Promise.resolve(
        this.runTmux([
          'capture-pane',
          '-p',
          '-t',
          this.sessionName!,
          '-S',
          `-${lines}`,
        ]),
      );
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async waitForExit(timeoutMs: number): Promise<void> {
    this.ensureSession();
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const output = this.runTmux([
          'list-panes',
          '-t',
          `${this.sessionName}:0`,
          '-F',
          '#{pane_dead}',
        ]).trim();
        if (output.trim() === '1') return;
      } catch (error) {
        if (error instanceof Error && error.message.includes("can't find session")) {
          return;
        }
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Timed out waiting for tmux pane to exit');
  }

  private ensureSession(): void {
    if (!this.sessionName) {
      throw new Error('tmux session not started');
    }
  }

  private async waitForSession(sessionName: string, timeoutMs: number) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        this.runTmux(['has-session', '-t', sessionName]);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error('Timed out waiting for tmux session');
  }

  async waitForOutput(text: string, timeoutMs: number): Promise<void> {
    this.ensureSession();
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const screen = this.runTmux([
        'capture-pane',
        '-p',
        '-t',
        this.sessionName!,
      ]);
      if (screen.includes(text)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for output: ${text}`);
  }

  private runTmux(args: string[]): string {
    const result = spawnSync(this.tmuxCommand, args, {
      encoding: 'utf8',
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      const message = result.stderr.trim();
      throw new Error(message.length > 0 ? message : 'tmux command failed');
    }
    return result.stdout;
  }
}

export { TmuxBackend };
