/**
 * Shared domain contracts for Knock-On.
 *
 * These schemas are the single source of truth for the HTTP API documented in
 * docs/API_CONTRACT.md. Route handlers (server) and the React UI (client) both
 * import from here, so nothing in this directory may import credentials, the
 * database, or Univer packages.
 */
import { z } from 'zod';
import { BAKERY_INPUT_KEYS } from '@/lib/templates/bakery';

/** Scenario kinds. Baseline has no parent; a shock forks from the baseline; a response forks from a saved shock. */
export const scenarioKindSchema = z.enum(['baseline', 'shock', 'response']);
export type ScenarioKind = z.infer<typeof scenarioKindSchema>;

/** Where an assumption came from. */
export const assumptionSourceSchema = z.enum(['user', 'demo']);
export type AssumptionSource = z.infer<typeof assumptionSourceSchema>;

export const inputKeySchema = z.enum(BAKERY_INPUT_KEYS);

/**
 * The exact price and sales volume a user confirmed. Stored with a confirmed
 * `monthlyUnits` assumption so the server can tell when a later price or units
 * change has made the confirmation stale.
 */
export const confirmedForSchema = z.object({
  unitPrice: z.number(),
  monthlyUnits: z.number(),
});
export type ConfirmedFor = z.infer<typeof confirmedForSchema>;

/**
 * An explicit statement about one template input. A confirmed `monthlyUnits`
 * assumption is required when a scenario's price differs from its parent's
 * (see API contract, "price change").
 */
export const assumptionSchema = z.object({
  inputKey: inputKeySchema,
  note: z.string().trim().max(2000),
  source: assumptionSourceSchema,
  confirmed: z.boolean(),
  confirmedFor: confirmedForSchema.optional(),
});
export type Assumption = z.infer<typeof assumptionSchema>;

export const assumptionsSchema = z
  .array(assumptionSchema)
  .max(50)
  .refine((list) => new Set(list.map((a) => a.inputKey)).size === list.length, {
    message: 'Each input can have at most one assumption.',
  });

/** A formula cell that failed calculation, by A1 reference. */
export const calculationErrorSchema = z.object({
  cell: z.string(),
  message: z.string(),
});
export type CalculationError = z.infer<typeof calculationErrorSchema>;

/**
 * Server-calculated projection of one scenario's workbook. `metrics` values are
 * numbers or null (a blank margin maps to null, never 0). `errors` is empty for
 * a valid saved scenario.
 */
export const calculationSchema = z.object({
  status: z.enum(['valid', 'error']),
  inputs: z.record(z.string(), z.number()),
  metrics: z.record(z.string(), z.union([z.number(), z.null()])),
  errors: z.array(calculationErrorSchema),
});
export type Calculation = z.infer<typeof calculationSchema>;

/** Minimal structural shape of a Univer workbook snapshot (IWorkbookData). Detailed template checks run separately. */
export const workbookSnapshotSchema = z
  .object({
    id: z.string().min(1),
    sheetOrder: z.array(z.string()).optional(),
    sheets: z.record(z.string(), z.unknown()),
  })
  .passthrough();
export type WorkbookSnapshot = z.infer<typeof workbookSnapshotSchema>;

/** A scenario as returned by the API. */
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

/** Complete project (GET /api/projects/:id and every mutation response). */
export const projectSchema = projectSummarySchema.extend({
  schemaVersion: z.number().int(),
  templateVersion: z.number().int(),
  baselineScenarioId: z.string(),
  baselineFrozen: z.boolean(),
  /** True when the project was created with fictional demo figures. */
  demo: z.boolean(),
  scenarios: z.array(scenarioSchema),
  createdAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

/** Naming rule shared by projects and scenarios. */
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(80, 'Name must be 80 characters or fewer.');

export const notesSchema = z.string().max(5000, 'Notes must be 5000 characters or fewer.');

/** ISO 4217 currency code (e.g. "USD"). Conversion is out of scope. */
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO 4217 code, for example "USD".');

const revisionSchema = z.number().int().min(1);

/** POST /api/projects */
export const createProjectRequestSchema = z.object({
  name: nameSchema,
  currency: currencySchema,
  templateId: z.string().min(1),
  initialData: z.enum(['demo', 'blank']),
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

/** POST /api/projects/:projectId/scenarios */
export const forkScenarioRequestSchema = z.object({
  expectedRevision: revisionSchema,
  sourceScenarioId: z.string().min(1),
  kind: z.enum(['shock', 'response']),
  name: nameSchema,
});
export type ForkScenarioRequest = z.infer<typeof forkScenarioRequestSchema>;

/** PUT /api/projects/:projectId/scenarios/:scenarioId */
export const updateScenarioRequestSchema = z.object({
  expectedRevision: revisionSchema,
  name: nameSchema,
  notes: notesSchema,
  workbook: workbookSnapshotSchema,
  assumptions: assumptionsSchema,
});
export type UpdateScenarioRequest = z.infer<typeof updateScenarioRequestSchema>;

/** POST /api/projects/:projectId/scenarios/:scenarioId/explanation */
export const explanationRequestSchema = z.object({
  expectedRevision: revisionSchema,
  question: z.string().trim().max(500).optional(),
});
export type ExplanationRequest = z.infer<typeof explanationRequestSchema>;

/** A Ling-generated explanation tied to the exact saved revision it describes. */
export const explanationSchema = z.object({
  projectId: z.string(),
  scenarioId: z.string(),
  projectRevision: z.number().int(),
  model: z.string(),
  explanation: z.string(),
  generatedAt: z.string(),
});
export type Explanation = z.infer<typeof explanationSchema>;

/** Error body shared by every failure response. */
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

/** Hard cap on one request body so a runaway client cannot fill the database. */
export const MAX_REQUEST_BYTES = 1_000_000;
