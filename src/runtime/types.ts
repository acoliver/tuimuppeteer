import type { z } from 'zod';
import type { scenarioSchema, sequenceSchema, stepSchema } from '../schema/schema.js';

type Scenario = z.infer<typeof scenarioSchema>;
type Sequence = z.infer<typeof sequenceSchema>;
type Step = z.infer<typeof stepSchema>;

type RunStatus = 'passed' | 'failed' | 'skipped';

interface StepResult {
  id?: string;
  type: Step['type'];
  status: RunStatus;
  durationMs: number;
  error?: string | null;
}

interface SequenceResult {
  name: string;
  status: RunStatus;
  durationMs: number;
  steps: StepResult[];
  artifacts: string[];
}

interface RunReport {
  schemaVersion: 'v1';
  scenario: string;
  startedAt: string;
  finishedAt: string;
  status: RunStatus;
  sequences: SequenceResult[];
}

interface RunPlan {
  scenario: Scenario;
  sequences: Sequence[];
}

interface Backend {
  launch(command: string, args: string[], cwd?: string): Promise<{ pid: number }>;
  isRunning(pid: number): Promise<boolean>;
  sendKeys(keys: string[]): Promise<void>;
  sendLine(text: string): Promise<void>;
  paste(text: string): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
  captureScreen(): Promise<string>;
  captureScrollback(lines: number): Promise<string>;
  waitForExit(timeoutMs: number): Promise<void>;
}

export type {
  Backend,
  RunPlan,
  RunReport,
  RunStatus,
  Scenario,
  Sequence,
  SequenceResult,
  Step,
  StepResult,
};
