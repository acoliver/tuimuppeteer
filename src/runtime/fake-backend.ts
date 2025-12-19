import type { Backend } from './types.js';

interface FakeBackendOptions {
  initialScreen?: string;
  initialScrollback?: string;
  exitAfterKeys?: string[];
  exitAfterLines?: string[];
  exitAfterPaste?: string[];
}

class FakeBackend implements Backend {
  private running = false;
  private screen: string;
  private scrollback: string;
  private readonly sentKeys: string[] = [];
  private readonly sentLines: string[] = [];
  private readonly pasted: string[] = [];

  constructor(private readonly options: FakeBackendOptions = {}) {
    this.screen = options.initialScreen ?? '';
    this.scrollback = options.initialScrollback ?? '';
  }

  launch(command: string, args: string[], cwd?: string): Promise<{ pid: number }> {
    void command;
    void args;
    void cwd;
    this.running = true;
    return Promise.resolve({ pid: 1234 });
  }

  isRunning(pid: number): Promise<boolean> {
    void pid;
    return Promise.resolve(this.running);
  }

  sendKeys(keys: string[]): Promise<void> {
    this.sentKeys.push(...keys);
    if (this.options.exitAfterKeys) {
      const joined = keys.join(' ');
      if (this.options.exitAfterKeys.includes(joined) === true) {
        this.running = false;
      }
    }
    return Promise.resolve();
  }

  sendLine(text: string): Promise<void> {
    this.sentLines.push(text);
    this.appendOutput(text);
    if (this.options.exitAfterLines?.includes(text) === true) {
      this.running = false;
    }
    return Promise.resolve();
  }

  paste(text: string): Promise<void> {
    this.pasted.push(text);
    this.appendOutput(text);
    if (this.options.exitAfterPaste?.includes(text) === true) {
      this.running = false;
    }
    return Promise.resolve();
  }

  private cols = 0;
  private rows = 0;

  resize(cols: number, rows: number): Promise<void> {
    this.cols = cols;
    this.rows = rows;
    return Promise.resolve();
  }

  getSize(): { cols: number; rows: number } {
    return { cols: this.cols, rows: this.rows };
  }

  captureScreen(): Promise<string> {
    return Promise.resolve(this.screen);
  }

  captureScrollback(lines: number): Promise<string> {
    const entries = this.scrollback.split('\n').filter((line) => line.length > 0);
    const slice = lines > 0 ? entries.slice(-lines) : entries;
    return Promise.resolve(slice.join('\n'));
  }

  async waitForExit(timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!this.running) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Timed out waiting for fake backend to exit');
  }

  getSentLines(): string[] {
    return [...this.sentLines];
  }

  getSentKeys(): string[] {
    return [...this.sentKeys];
  }

  getPasted(): string[] {
    return [...this.pasted];
  }

  setScreen(text: string): void {
    this.screen = text;
  }

  setScrollback(text: string): void {
    this.scrollback = text;
  }

  private appendOutput(text: string): void {
    if (this.screen.length > 0) {
      this.screen += '\n';
    }
    this.screen += text;
    this.scrollback += `${text}\n`;
  }
}

export { FakeBackend };
export type { FakeBackendOptions };
