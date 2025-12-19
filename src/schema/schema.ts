import { z } from 'zod';

const matcherSchema = z
  .object({
    contains: z.string().min(1).optional(),
    regex: z.string().min(1).optional(),
    regexFlags: z.string().optional(),
  })
  .refine((value) => Boolean(value.contains) || Boolean(value.regex), {
    message: 'Matcher requires contains or regex',
  });

const commonStepFields = {
  id: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
  pollMs: z.number().int().positive().optional(),
  scope: z.enum(['screen', 'scrollback']).optional(),
  scrollbackLines: z.number().int().positive().optional(),
  capturesDir: z.string().min(1).optional(),
};

const lineStepSchema = z.object({
  ...commonStepFields,
  type: z.literal('line'),
  text: z.string(),
  submitKeys: z.array(z.string().min(1)).optional(),
  postTypeMs: z.number().int().nonnegative().optional(),
});

const sendKeysStepSchema = z.object({
  ...commonStepFields,
  type: z.literal('sendKeys'),
  keys: z.string().min(1),
});

const keysStepSchema = z.object({
  ...commonStepFields,
  type: z.literal('keys'),
  keys: z.array(z.string().min(1)).min(1),
});

const pasteStepSchema = z.object({
  ...commonStepFields,
  type: z.literal('paste'),
  text: z.string(),
});

const mouseStepSchema = z
  .object({
    ...commonStepFields,
    type: z.literal('mouse'),
    action: z.enum(['move', 'down', 'up', 'click', 'drag', 'wheel']),
    button: z.enum(['left', 'middle', 'right']).optional(),
    x: z.number().int().nonnegative().optional(),
    y: z.number().int().nonnegative().optional(),
    delta: z.number().int().optional(),
    modifiers: z.array(z.enum(['shift', 'alt', 'ctrl', 'meta'])).optional(),
  })
  .superRefine((step, ctx) => {
    const needsCoords = step.action === 'move' || step.action === 'drag';
    const needsButton =
      step.action === 'down' ||
      step.action === 'up' ||
      step.action === 'click' ||
      step.action === 'drag';
    const needsDelta = step.action === 'wheel';

    if (needsCoords && (step.x === undefined || step.y === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'mouse action requires x and y',
      });
    }
    if (needsButton && step.button === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'mouse action requires button',
      });
    }
    if (needsDelta && step.delta === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'mouse wheel requires delta',
      });
    }
  });

const scrollStepSchema = z.object({
  ...commonStepFields,
  type: z.literal('scroll'),
  direction: z.enum(['up', 'down', 'pageUp', 'pageDown', 'top', 'bottom']),
  amount: z.number().int().positive().optional(),
});

const resizeStepSchema = z.object({
  ...commonStepFields,
  type: z.literal('resize'),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

const sleepStepSchema = z.object({
  ...commonStepFields,
  type: z.literal('sleep'),
  ms: z.number().int().nonnegative(),
});

const macroStepSchema = z.object({
  ...commonStepFields,
  type: z.literal('macro'),
  name: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional(),
});


const waitForStepSchema = z
  .object({
    ...commonStepFields,
    type: z.literal('waitFor'),
  })
  .and(matcherSchema);

const waitForNotStepSchema = z
  .object({
    ...commonStepFields,
    type: z.literal('waitForNot'),
  })
  .and(matcherSchema);

const expectStepSchema = z
  .object({
    ...commonStepFields,
    type: z.literal('expect'),
  })
  .and(matcherSchema);

const expectCountStepSchema = z
  .object({
    ...commonStepFields,
    type: z.literal('expectCount'),
    equals: z.number().int().nonnegative().optional(),
    atLeast: z.number().int().nonnegative().optional(),
    atMost: z.number().int().nonnegative().optional(),
  })
  .and(matcherSchema)
  .refine(
    (step) =>
      step.equals !== undefined ||
      step.atLeast !== undefined ||
      step.atMost !== undefined,
    {
      message: 'expectCount requires equals, atLeast, or atMost',
    },
  );

const waitForExitStepSchema = z.object({
  ...commonStepFields,
  type: z.literal('waitForExit'),
});

const captureStepSchema = z.object({
  ...commonStepFields,
  type: z.literal('capture'),
  scope: z.enum(['screen', 'scrollback', 'both']).optional(),
  name: z.string().min(1).optional(),
  format: z.enum(['text', 'ansi', 'json']).optional(),
});

const stepSchema = z.union([
  lineStepSchema,
  sendKeysStepSchema,
  keysStepSchema,
  pasteStepSchema,
  mouseStepSchema,
  scrollStepSchema,
  resizeStepSchema,
  sleepStepSchema,
  macroStepSchema,
  waitForStepSchema,
  waitForNotStepSchema,
  expectStepSchema,
  expectCountStepSchema,
  waitForExitStepSchema,
  captureStepSchema,
]);

const launchSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  cwd: z.string().min(1).optional(),
  backend: z.enum(['tmux', 'pty']),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
  startupTimeoutMs: z.number().int().positive().optional(),
  readyMatcher: matcherSchema.optional(),
});

const defaultsSchema = z.object({
  waitTimeoutMs: z.number().int().positive().optional(),
  pollMs: z.number().int().positive().optional(),
  scrollbackLines: z.number().int().positive().optional(),
  postTypeMs: z.number().int().nonnegative().optional(),
});

const artifactsSchema = z.object({
  report: z.union([z.literal('stdout'), z.string().min(1)]).optional(),
  capturesDir: z.string().min(1).optional(),
  redact: z.boolean().optional(),
  redactPatterns: z.array(z.string().min(1)).optional(),
});

const macroFileSchema = z.object({
  schemaVersion: z.literal('v1'),
  macros: z.record(z.string(), z.array(stepSchema)),
});

const sequenceSchema = z.object({
  schemaVersion: z.literal('v1'),
  name: z.string().min(1),
  prerequisites: z.array(z.string().min(1)).optional(),
  ensure: matcherSchema.optional(),
  steps: z.array(stepSchema),
});

const scenarioSchema = z.object({
  schemaVersion: z.literal('v1'),
  name: z.string().min(1),
  launch: launchSchema,
  defaults: defaultsSchema.optional(),
  artifacts: artifactsSchema.optional(),
  sequenceOrder: z.array(z.string().min(1)).min(1),
});

export {
  artifactsSchema,
  defaultsSchema,
  launchSchema,
  macroFileSchema,
  matcherSchema,
  scenarioSchema,
  sequenceSchema,
  stepSchema,
};
