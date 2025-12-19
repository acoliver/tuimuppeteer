import type {
  Backend,
  RunReport,
  Scenario,
  Sequence,
  SequenceResult,
  Step,
} from './types.js';
import { createReport } from './report.js';
import { expandMacroSteps, mergeMacros, parseMacroFile } from '../load/loader.js';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_POLL_MS = 200;
const DEFAULT_SCROLLBACK_LINES = 2000;
const DEFAULT_POST_TYPE_MS = 0;

function nowMs(): number {
  return Date.now();
}

interface ExecutionContext {
  backend: Backend;
  macros: Record<string, Step[]>;
  defaults: {
    waitTimeoutMs: number;
    pollMs: number;
    scrollbackLines: number;
    postTypeMs: number;
  };
}

function buildExecutionContext(
  scenario: Scenario,
  macroFiles: { schemaVersion: 'v1'; macros: Record<string, Step[]> }[],
  backend: Backend,
): ExecutionContext {
  const macros = mergeMacros(macroFiles.map((file) => parseMacroFile(file)));
  const defaults = {
    waitTimeoutMs: scenario.defaults?.waitTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    pollMs: scenario.defaults?.pollMs ?? DEFAULT_POLL_MS,
    scrollbackLines: scenario.defaults?.scrollbackLines ?? DEFAULT_SCROLLBACK_LINES,
    postTypeMs: scenario.defaults?.postTypeMs ?? DEFAULT_POST_TYPE_MS,
  };
  return { backend, macros, defaults };
}

function orderSequences(scenario: Scenario, sequences: Sequence[]): Sequence[] {
  const sequenceMap = new Map(sequences.map((sequence) => [sequence.name, sequence]));
  return scenario.sequenceOrder.map((name) => {
    const sequence = sequenceMap.get(name);
    if (!sequence) {
      throw new Error(`Scenario references missing sequence: ${name}`);
    }
    return sequence;
  });
}

async function launchAndWait(
  scenario: Scenario,
  ctx: ExecutionContext,
): Promise<number> {
  const { pid } = await ctx.backend.launch(
    scenario.launch.command,
    scenario.launch.args ?? [],
    scenario.launch.cwd,
  );

  if (scenario.launch.startupTimeoutMs !== undefined && scenario.launch.startupTimeoutMs > 0) {
    await waitForRunning(pid, scenario.launch.startupTimeoutMs, ctx.backend);
  }

  if (scenario.launch.readyMatcher) {
    await waitForMatcher(
      {
        ...scenario.launch.readyMatcher,
        timeoutMs: scenario.launch.startupTimeoutMs ?? ctx.defaults.waitTimeoutMs,
      },
      ctx,
    );
  }

  return pid;
}

async function runScenario(
  scenario: Scenario,
  sequences: Sequence[],
  macroFiles: { schemaVersion: 'v1'; macros: Record<string, Step[]> }[] = [],
  backend: Backend,
): Promise<RunReport> {
  const ctx = buildExecutionContext(scenario, macroFiles, backend);
  const ordered = orderSequences(scenario, sequences);
  const pid = await launchAndWait(scenario, ctx);

  const results: SequenceResult[] = [];
  for (const sequence of ordered) {
    const result = await runSequence(sequence, ctx, pid);
    results.push(result);
    if (result.status === 'failed') {
      break;
    }
  }

  return createReport(scenario.name, results);
}

async function verifySequenceReady(
  sequence: Sequence,
  ctx: ExecutionContext,
  pid: number,
): Promise<boolean> {
  const ensureRunningResult = await ensureRunning(
    pid,
    ctx.backend,
    ctx.defaults.waitTimeoutMs,
  );
  if (!ensureRunningResult) {
    return false;
  }

  if (sequence.ensure) {
    const ensureStatus = await runMatcher(
      sequence.ensure,
      ctx,
      ctx.defaults.waitTimeoutMs,
      ctx.defaults.pollMs,
      ctx.defaults.scrollbackLines,
    );
    if (!ensureStatus) {
      return false;
    }
  }

  return true;
}

async function runSequence(
  sequence: Sequence,
  ctx: ExecutionContext,
  pid: number,
): Promise<SequenceResult> {
  const start = nowMs();
  const steps = expandMacroSteps(sequence.steps, ctx.macros);
  const stepResults: SequenceResult['steps'] = [];
  const artifacts: string[] = [];

  const ready = await verifySequenceReady(sequence, ctx, pid);
  if (!ready) {
    return {
      name: sequence.name,
      status: 'failed',
      durationMs: nowMs() - start,
      steps: [],
      artifacts,
    };
  }

  for (const step of steps) {
    const stepResult = await runStep(step, ctx);
    stepResults.push(stepResult);
    if (stepResult.status === 'failed') {
      return {
        name: sequence.name,
        status: 'failed',
        durationMs: nowMs() - start,
        steps: stepResults,
        artifacts,
      };
    }
  }

  return {
    name: sequence.name,
    status: 'passed',
    durationMs: nowMs() - start,
    steps: stepResults,
    artifacts,
  };
}


async function executeLine(
  step: Extract<Step, { type: 'line' }>,
  ctx: ExecutionContext,
): Promise<void> {
  await ctx.backend.sendLine(step.text);
  if ((step.postTypeMs ?? ctx.defaults.postTypeMs) > 0) {
    await delay(step.postTypeMs ?? ctx.defaults.postTypeMs);
  }
}

async function executeWaitStep(
  step: Extract<Step, { type: 'waitFor' | 'waitForNot' }>,
  ctx: ExecutionContext,
): Promise<void> {
  const negated = step.type === 'waitForNot';
  await waitForMatcher(step, ctx, negated);
}

async function executeExpectStep(
  step: Extract<Step, { type: 'expect' | 'expectCount' }>,
  ctx: ExecutionContext,
): Promise<void> {
  if (step.type === 'expect') {
    await expectMatcher(step, ctx);
  } else {
    await expectCount(step, ctx);
  }
}

async function executeInputStep(
  step: Extract<Step, { type: 'sendKeys' | 'keys' | 'paste' }>,
  ctx: ExecutionContext,
): Promise<void> {
  if (step.type === 'sendKeys') {
    await ctx.backend.sendKeys(step.keys.split(' '));
  } else if (step.type === 'keys') {
    await ctx.backend.sendKeys(step.keys);
  } else {
    await ctx.backend.paste(step.text);
  }
}

async function executeInteractionStep(
  step: Extract<Step, { type: 'line' | 'sendKeys' | 'keys' | 'paste' | 'sleep' | 'resize' }>,
  ctx: ExecutionContext,
): Promise<void> {
  switch (step.type) {
    case 'line':
      await executeLine(step, ctx);
      return;
    case 'sendKeys':
    case 'keys':
    case 'paste':
      await executeInputStep(step, ctx);
      return;
    case 'sleep':
      await delay(step.ms);
      return;
    case 'resize':
      await ctx.backend.resize(step.cols, step.rows);
      return;
  }
}

async function executeSpecialStep(
  step: Extract<Step, { type: 'waitForExit' | 'capture' | 'mouse' | 'scroll' | 'macro' }>,
  ctx: ExecutionContext,
): Promise<void> {
  switch (step.type) {
    case 'waitForExit':
      await ctx.backend.waitForExit(step.timeoutMs ?? ctx.defaults.waitTimeoutMs);
      return;
    case 'capture':
      await captureOutput(step, ctx);
      return;
    case 'mouse':
    case 'scroll':
    case 'macro':
      throw new Error('Step type not supported in executor');
  }
}

const INTERACTION_TYPES = new Set([
  'line',
  'sendKeys',
  'keys',
  'paste',
  'sleep',
  'resize',
]);

const WAIT_TYPES = new Set(['waitFor', 'waitForNot']);

const EXPECT_TYPES = new Set(['expect', 'expectCount']);

const SPECIAL_TYPES = new Set(['waitForExit', 'capture', 'mouse', 'scroll', 'macro']);

async function executeStepAction(step: Step, ctx: ExecutionContext): Promise<void> {
  if (INTERACTION_TYPES.has(step.type)) {
    await executeInteractionStep(
      step as Extract<
        Step,
        { type: 'line' | 'sendKeys' | 'keys' | 'paste' | 'sleep' | 'resize' }
      >,
      ctx,
    );
    return;
  }
  if (WAIT_TYPES.has(step.type)) {
    await executeWaitStep(
      step as Extract<Step, { type: 'waitFor' | 'waitForNot' }>,
      ctx,
    );
    return;
  }
  if (EXPECT_TYPES.has(step.type)) {
    await executeExpectStep(
      step as Extract<Step, { type: 'expect' | 'expectCount' }>,
      ctx,
    );
    return;
  }
  if (SPECIAL_TYPES.has(step.type)) {
    await executeSpecialStep(
      step as Extract<
        Step,
        { type: 'waitForExit' | 'capture' | 'mouse' | 'scroll' | 'macro' }
      >,
      ctx,
    );
    return;
  }
  throw new Error('Step type not supported in executor');
}

async function runStep(
  step: Step,
  ctx: ExecutionContext,
): Promise<SequenceResult['steps'][number]> {
  const start = nowMs();
  try {
    await executeStepAction(step, ctx);
    return {
      id: step.id,
      type: step.type,
      status: 'passed',
      durationMs: nowMs() - start,
      error: null,
    };
  } catch (error) {
    return {
      id: step.id,
      type: step.type,
      status: 'failed',
      durationMs: nowMs() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runMatcher(
  matcher: {
    contains?: string;
    regex?: string;
    regexFlags?: string;
    scope?: 'screen' | 'scrollback';
    scrollbackLines?: number;
  },
  ctx: ExecutionContext,
  timeoutMs: number,
  pollMs: number,
  scrollbackLines: number,
): Promise<boolean> {
  try {
    await waitForMatcher(
      {
        ...matcher,
        timeoutMs,
        pollMs,
        scrollbackLines,
      },
      ctx,
    );
    return true;
  } catch {
    return false;
  }
}

async function waitForMatcher(
  step: {
    contains?: string;
    regex?: string;
    regexFlags?: string;
    timeoutMs?: number;
    pollMs?: number;
    scope?: 'screen' | 'scrollback';
    scrollbackLines?: number;
  },
  ctx: ExecutionContext,
  negated = false,
): Promise<void> {
  const timeoutMs = step.timeoutMs ?? ctx.defaults.waitTimeoutMs;
  const pollMs = step.pollMs ?? ctx.defaults.pollMs;
  const scope = step.scope ?? 'screen';
  const scrollbackLines = step.scrollbackLines ?? ctx.defaults.scrollbackLines;
  const end = nowMs() + timeoutMs;

  while (nowMs() < end) {
    const content =
      scope === 'scrollback'
        ? await ctx.backend.captureScrollback(scrollbackLines)
        : await ctx.backend.captureScreen();

    const matches = matchContent(content, step.contains, step.regex, step.regexFlags);
    if (negated ? !matches : matches) return;
    await delay(pollMs);
  }

  throw new Error('Timed out waiting for matcher');
}

async function expectMatcher(
  step: {
    contains?: string;
    regex?: string;
    regexFlags?: string;
    scope?: 'screen' | 'scrollback';
    scrollbackLines?: number;
  },
  ctx: ExecutionContext,
): Promise<void> {
  const scope = step.scope ?? 'screen';
  const scrollbackLines = step.scrollbackLines ?? ctx.defaults.scrollbackLines;
  const content =
    scope === 'scrollback'
      ? await ctx.backend.captureScrollback(scrollbackLines)
      : await ctx.backend.captureScreen();
  const matches = matchContent(content, step.contains, step.regex, step.regexFlags);
  if (!matches) {
    throw new Error('Expected matcher to succeed');
  }
}

async function expectCount(
  step: {
    contains?: string;
    regex?: string;
    regexFlags?: string;
    equals?: number;
    atLeast?: number;
    atMost?: number;
    scope?: 'screen' | 'scrollback';
    scrollbackLines?: number;
  },
  ctx: ExecutionContext,
): Promise<void> {
  const scope = step.scope ?? 'screen';
  const scrollbackLines = step.scrollbackLines ?? ctx.defaults.scrollbackLines;
  const content =
    scope === 'scrollback'
      ? await ctx.backend.captureScrollback(scrollbackLines)
      : await ctx.backend.captureScreen();
  const count = countMatches(content, step.contains, step.regex, step.regexFlags);

  if (step.equals !== undefined && count !== step.equals) {
    throw new Error(`Expected count to equal ${step.equals}`);
  }
  if (step.atLeast !== undefined && count < step.atLeast) {
    throw new Error(`Expected count to be at least ${step.atLeast}`);
  }
  if (step.atMost !== undefined && count > step.atMost) {
    throw new Error(`Expected count to be at most ${step.atMost}`);
  }
}

async function captureOutput(
  step: { scope?: 'screen' | 'scrollback' | 'both'; scrollbackLines?: number },
  ctx: ExecutionContext,
): Promise<void> {
  const scope = step.scope ?? 'screen';
  if (scope === 'screen') {
    await ctx.backend.captureScreen();
    return;
  }
  if (scope === 'scrollback') {
    await ctx.backend.captureScrollback(
      step.scrollbackLines ?? ctx.defaults.scrollbackLines,
    );
    return;
  }
  await ctx.backend.captureScreen();
  await ctx.backend.captureScrollback(
    step.scrollbackLines ?? ctx.defaults.scrollbackLines,
  );
}

async function waitForRunning(
  pid: number,
  timeoutMs: number,
  backend: Backend,
): Promise<void> {
  const end = nowMs() + timeoutMs;
  while (nowMs() < end) {
    const running = await backend.isRunning(pid);
    if (running) {
      return;
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for process to start');
}

async function ensureRunning(
  pid: number,
  backend: Backend,
  timeoutMs: number,
): Promise<boolean> {
  try {
    await waitForRunning(pid, timeoutMs, backend);
    return true;
  } catch {
    return false;
  }
}

function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchContent(
  content: string,
  contains?: string,
  regex?: string,
  regexFlags?: string,
): boolean {
  if (contains) {
    const matcher = new RegExp(escapeRegExp(contains), 'g');
    return matcher.exec(content) !== null;
  }
  if (!regex) {
    return false;
  }
  const matcher = new RegExp(regex, regexFlags ?? undefined);
  return matcher.test(content);
}

function countMatches(
  content: string,
  contains?: string,
  regex?: string,
  regexFlags?: string,
): number {
  if (contains) {
    const matcher = new RegExp(escapeRegExp(contains), 'g');
    let count = 0;
    while (matcher.exec(content)) {
      count += 1;
    }
    return count;
  }
  if (!regex) {
    return 0;
  }
  const matcher = new RegExp(regex, regexFlags ?? undefined);
  const matches = content.match(matcher);
  return matches ? matches.length : 0;
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export { runScenario, runSequence, runStep };
