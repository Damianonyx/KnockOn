/**
 * Shared domain contracts for Knock-On.
 *
 * These schemas are the single source of truth for the HTTP API documented in
 * docs/API_CONTRACT.md. Both the Next.js route handlers (server) and the React
 * UI (client) import from here; nothing in this directory may import credentials,
 * Prisma, or Univer UI packages.
 */
import { z } from 'zod';

/** Scenario kinds. Baseline has no parent; a shock forks from the baseline; a response forks from a saved shock. */
export const scenarioKindSchema = z.enum(['baseline', 'shock', 'response']);
export type ScenarioKind = z.infer<typeof scenarioKindSchema>;

/** Where a workbook input value came from. */
export const assumptionSourceSchema = z.enum(['user', 'demo']);
export type AssumptionSource = z.infer<typeof assumptionSourceSchema>;

/**
 * An explicit statement about one template input. `confirmed` is required when a
 * price change makes the sales-volume assumption load-bearing (see API contract).
 */
export const assumptionSchema = z.object({
  inputKey: z.string().min(1),
  note: z.string().max(2000),
  source: assumptionSourceSchema,
  confirmed: z.boolean(),
});
export type Assumption = z.infer<typeof assumptionSchema>;

/** A single formula cell that failed calculation, by A1 reference. */
export const calculationErrorSchema = z.object({
  cell: z.string(),
  message: z.string(),
});
export type CalculationError = z.infer<typeof calculationErrorSchema>;

/**
 * Server-calculated projection of one scenario's workbook. `metrics` values are
 * numbers or null (blank margin maps to null, never 0). `errors` is empty for a
 * valid saved scenario.
 */
export const calculationSchema = z.object({
  status: z.enum(['valid', 'error']),
  inputs: z.record(z.string(), z.number()),
  metrics: z.record(z.string(), z.union([z.number(), z.null()])),
  errors: z.array(calculationErrorSchema),
});
export type Calculation = z.infer<typeof calculationSchema>;

/** Minimal structural type for a Univer workbook snapshot, mirrored from @univerjs/core IWorkbookData. */
export const workbookSnapshotSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    sheetOrder: z.array(z.string()).optional(),
    sheets: z.record(z.string(), z.unknown()),
  })
  .passthrough();
export type WorkbookSnapshot = z.infer<typeof workbookSnapshotSchema>;

/** A scenario row as stored and returned by the API. */
export const scenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: scenarioKindSchema,
  parentScenarioId: z.string().nullable(),
  notes: z.string(),
  workbook: workbookSnapshotSchema,
  assumptions: z.array(assumptionSchema),
  calculation: calculationSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Scenario = z.infer<typeof scenarioSchema>;

/** Project list entry (GET /api/projects). */
export const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  currency: z.string(),
  templateId: z.string(),
  revision: z.number().int(),
  updatedAt: z.string(),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

/** Complete project (GET /api/projects/:id and all mutation responses). */
export const projectSchema = projectSummarySchema.extend({
  schemaVersion: z.number().int(),
  templateVersion: z.number().int(),
  baselineScenarioId: z.string(),
  baselineFrozen: z.boolean(),
  scenarios: z.array(scenarioSchema),
  createdAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

/** Success envelope: every endpoint returns `{ "data": ... }`. */
export const okEnvelopeSchema = z.object({ data: z.unknown() });

/** Error envelope shared by every failure response. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
    currentRevision: z.number().int().optional(),
    invalidCells: z.array(calculationErrorSchema).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

/** Naming rule shared by projects, scenarios, and template descriptors. */
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(80, 'Name must be 80 characters or fewer.');

/** ISO 4217 currency code (e.g. "USD"). Conversion is out of scope. */
export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO 4217 code, e.g. "USD".');

/** Hard cap on one save/fork payload so a runaway client cannot fill the SQLite file. */
export const MAX_WORKBOOK_BYTES = 1_000_000;
