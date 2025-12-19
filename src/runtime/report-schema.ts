import { z } from 'zod';

const stepResultSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.string().min(1),
  status: z.enum(['passed', 'failed', 'skipped']),
  durationMs: z.number().int().nonnegative(),
  error: z.union([z.string().min(1), z.literal(null)]).optional(),
});

const sequenceResultSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['passed', 'failed', 'skipped']),
  durationMs: z.number().int().nonnegative(),
  steps: z.array(stepResultSchema),
  artifacts: z.array(z.string().min(1)),
});

const reportSchema = z.object({
  schemaVersion: z.literal('v1'),
  scenario: z.string().min(1),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  status: z.enum(['passed', 'failed', 'skipped']),
  sequences: z.array(sequenceResultSchema).min(1),
});

type ReportSchema = z.infer<typeof reportSchema>;

type SequenceResultSchema = z.infer<typeof sequenceResultSchema>;

type StepResultSchema = z.infer<typeof stepResultSchema>;

export {
  reportSchema,
  sequenceResultSchema,
  stepResultSchema,
  type ReportSchema,
  type SequenceResultSchema,
  type StepResultSchema,
};
