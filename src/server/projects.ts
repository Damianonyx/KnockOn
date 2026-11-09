/**
 * Project and scenario service: the rules from docs/API_CONTRACT.md.
 *
 * - Every save and fork is recalculated on the server with Univer.
 * - Mutations use optimistic concurrency on the project revision.
 * - Creating the first shock freezes the baseline; frozen baselines reject writes.
 * - A price change needs an explicitly confirmed sales-volume assumption.
 */
import { randomUUID } from 'node:crypto';
import type {
  Assumption,
  Calculation,
  CreateProjectRequest,
  ForkScenarioRequest,
  Project,
  ProjectSummary,
  Scenario,
  UpdateScenarioRequest,
} from '@/lib/contracts/project';
import { getTemplate } from '@/lib/templates';
import {
  BAKERY_BLANK_INPUTS,
  BAKERY_DEMO_INPUTS,
  BAKERY_INPUT_KEYS,
  BAKERY_INPUTS,
  buildBakeryWorkbook,
  type BakeryInputKey,
} from '@/lib/templates/bakery';
import type { BakeryProjection } from '@/lib/univer/calculate';
import { readBakeryInput, type BakeryWorkbook } from '@/lib/univer/snapshot';
import { recalculateWorkbook, WorkbookValidationError } from '@/lib/univer/server/recalculate';
import { getDatabase, type Sql } from './db';
import { ApiError, notFound, revisionConflict } from './errors';
import * as repo from './repository';

export const SCHEMA_VERSION = 1;

const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

function toCalculation(projection: BakeryProjection): Calculation {
  return {
    status: projection.errors.length === 0 ? 'valid' : 'error',
    inputs: projection.inputs,
    metrics: projection.metrics,
    errors: projection.errors,
  };
}

function toScenario(record: repo.ScenarioRecord): Scenario {
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    parentScenarioId: record.parentScenarioId,
    notes: record.notes,
    workbook: record.workbook,
    assumptions: record.assumptions,
    calculation: record.calculation,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toSummary(p: repo.ProjectRecord): ProjectSummary {
  return { id: p.id, name: p.name, currency: p.currency, templateId: p.templateId, revision: p.revision, updatedAt: p.updatedAt };
}

/** Recalculate, mapping template violations and formula errors to API errors. */
async function calculateOrReject(workbook: unknown): Promise<{ workbook: BakeryWorkbook; calculation: Calculation }> {
  let result;
  try {
    result = await recalculateWorkbook(workbook);
  } catch (error) {
    if (error instanceof WorkbookValidationError) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'The workbook does not match the template. Check the highlighted cells.', {
        fields: Object.fromEntries(error.issues.map((i) => [i.field, i.message])),
      });
    }
    throw error;
  }
  const calculation = toCalculation(result.projection);
  if (calculation.status !== 'valid') {
    throw new ApiError(422, 'CALCULATION_ERROR', 'Some formulas could not be calculated. Fix the inputs and save again.', {
      invalidCells: calculation.errors,
    });
  }
  return { workbook: result.workbook, calculation };
}

function demoAssumptions(): Assumption[] {
  return BAKERY_INPUT_KEYS.map((inputKey) => ({
    inputKey,
    note: 'Fictional demo figure for learning, not real business data.',
    source: 'demo' as const,
    confirmed: false,
  }));
}

const PRICE_CONFIRMATION_MESSAGE = 'Enter or confirm expected monthly sales for this price change.';

/**
 * Apply the assumption rules to a scenario about to be saved:
 * - A price different from the parent's needs a confirmed `monthlyUnits`
 *   assumption whose `confirmedFor` matches the saved price and units.
 * - A `monthlyUnits` confirmation that no longer matches the price or units is
 *   cleared, so changing either value again requires a fresh confirmation.
 * - "demo" is only kept for a demo project's unchanged demo figures.
 */
function normaliseAssumptions(
  assumptions: Assumption[],
  workbook: BakeryWorkbook,
  parent: repo.ScenarioRecord | null,
  project: repo.ProjectRecord,
): Assumption[] {
  const unitPrice = readBakeryInput(workbook, 'unitPrice');
  const monthlyUnits = readBakeryInput(workbook, 'monthlyUnits');
  const parentPrice = parent ? readBakeryInput(parent.workbook, 'unitPrice') : null;
  const priceChanged = parent !== null && unitPrice !== parentPrice;

  const result = assumptions.map((a): Assumption => {
    let next: Assumption = { ...a };
    if (next.source === 'demo') {
      const value = readBakeryInput(workbook, next.inputKey);
      if (!project.demo || value !== BAKERY_DEMO_INPUTS[next.inputKey as BakeryInputKey]) next = { ...next, source: 'user' };
    }
    if (next.inputKey === 'monthlyUnits' && next.confirmed) {
      const matches = next.confirmedFor?.unitPrice === unitPrice && next.confirmedFor?.monthlyUnits === monthlyUnits;
      if (!matches) {
        const { confirmedFor: _stale, ...rest } = next;
        next = { ...rest, confirmed: false };
      }
    } else if (next.inputKey === 'monthlyUnits' && !next.confirmed && next.confirmedFor) {
      const { confirmedFor: _unused, ...rest } = next;
      next = rest;
    }
    return next;
  });

  if (priceChanged) {
    const confirmation = result.find((a) => a.inputKey === 'monthlyUnits');
    const original = assumptions.find((a) => a.inputKey === 'monthlyUnits');
    if (!confirmation || !confirmation.confirmed || confirmation.source !== 'user') {
      const stale = original?.confirmed === true;
      throw new ApiError(422, 'ASSUMPTION_REQUIRED', PRICE_CONFIRMATION_MESSAGE, {
        fields: {
          'assumptions.monthlyUnits': stale
            ? 'The price or expected sales changed after you confirmed. Confirm expected monthly sales again.'
            : 'Confirmation required.',
        },
      });
    }
  }
  return result;
}

export class ProjectService {
  constructor(private readonly db: Sql) {}

  async listProjects(): Promise<ProjectSummary[]> {
    return (await repo.listProjects(this.db)).map(toSummary);
  }

  async getProject(projectId: string): Promise<Project> {
    const project = await repo.findProject(this.db, projectId);
    if (!project) throw notFound('Project');
    const scenarios = (await repo.listScenarios(this.db, projectId)).map(toScenario);
    return {
      ...toSummary(project),
      schemaVersion: project.schemaVersion,
      templateVersion: project.templateVersion,
      baselineScenarioId: project.baselineScenarioId,
      baselineFrozen: project.baselineFrozen,
      demo: project.demo,
      scenarios,
      createdAt: project.createdAt,
    };
  }

  async createProject(request: CreateProjectRequest): Promise<Project> {
    const template = getTemplate(request.templateId);
    if (!template) throw notFound('Template');

    const demo = request.initialData === 'demo';
    const built = buildBakeryWorkbook(demo ? BAKERY_DEMO_INPUTS : BAKERY_BLANK_INPUTS, newId('wb'));
    const { workbook, calculation } = await calculateOrReject(built);

    const timestamp = now();
    const projectId = newId('proj');
    const baselineId = newId('scn');
    await this.db.transaction(async (tx) => {
      await repo.insertProject(tx, {
        id: projectId,
        name: request.name,
        currency: request.currency,
        templateId: template.id,
        templateVersion: template.version,
        schemaVersion: SCHEMA_VERSION,
        revision: 1,
        baselineScenarioId: baselineId,
        baselineFrozen: false,
        demo,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await repo.insertScenario(tx, {
        id: baselineId,
        projectId,
        position: 0,
        name: 'Baseline',
        kind: 'baseline',
        parentScenarioId: null,
        notes: demo ? 'Fictional demo figures for learning, not real business data.' : '',
        workbook,
        assumptions: demo ? demoAssumptions() : [],
        calculation,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });
    return this.getProject(projectId);
  }

  async forkScenario(projectId: string, request: ForkScenarioRequest): Promise<Project> {
    const project = await repo.findProject(this.db, projectId);
    if (!project) throw notFound('Project');
    if (project.revision !== request.expectedRevision) throw revisionConflict(project.revision);

    const source = await repo.findScenario(this.db, projectId, request.sourceScenarioId);
    if (!source) throw notFound('Source scenario');
    if (request.kind === 'shock' && source.kind !== 'baseline') {
      throw new ApiError(422, 'INVALID_FORK', 'A shock must be created from the baseline.', {
        fields: { sourceScenarioId: 'Choose the baseline.' },
      });
    }
    if (request.kind === 'response' && source.kind !== 'shock') {
      throw new ApiError(422, 'INVALID_FORK', 'A response must be created from a saved shock.', {
        fields: { sourceScenarioId: 'Choose a shock scenario.' },
      });
    }

    // Fork from the persisted source with a fresh workbook id so scenarios never alias.
    const copy = structuredClone(source.workbook);
    copy.id = newId('wb');
    const { workbook, calculation } = await calculateOrReject(copy);

    const timestamp = now();
    await this.db.transaction(async (tx) => {
      const freezeBaseline = request.kind === 'shock';
      if (!(await repo.bumpRevision(tx, projectId, request.expectedRevision, timestamp, { freezeBaseline }))) {
        throw revisionConflict((await repo.findProject(tx, projectId))?.revision ?? project.revision);
      }
      await repo.insertScenario(tx, {
        id: newId('scn'),
        projectId,
        position: await repo.nextScenarioPosition(tx, projectId),
        name: request.name,
        kind: request.kind,
        parentScenarioId: source.id,
        notes: '',
        workbook,
        assumptions: structuredClone(source.assumptions),
        calculation,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });
    return this.getProject(projectId);
  }

  async updateScenario(projectId: string, scenarioId: string, request: UpdateScenarioRequest): Promise<Project> {
    const project = await repo.findProject(this.db, projectId);
    if (!project) throw notFound('Project');
    const scenario = await repo.findScenario(this.db, projectId, scenarioId);
    if (!scenario) throw notFound('Scenario');
    if (project.revision !== request.expectedRevision) throw revisionConflict(project.revision);
    if (scenario.kind === 'baseline' && project.baselineFrozen) {
      throw new ApiError(
        409,
        'BASELINE_FROZEN',
        'The baseline is read-only because other scenarios are compared against it. Start a new project to change it.',
      );
    }
    if (request.workbook.id !== scenario.workbook.id) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'The workbook belongs to a different scenario.', {
        fields: { 'workbook.id': 'Workbook id must match this scenario.' },
      });
    }

    const { workbook, calculation } = await calculateOrReject(request.workbook);
    const parent = scenario.parentScenarioId ? await repo.findScenario(this.db, projectId, scenario.parentScenarioId) : null;
    const assumptions = normaliseAssumptions(request.assumptions, workbook, parent, project);

    const timestamp = now();
    await this.db.transaction(async (tx) => {
      if (!(await repo.bumpRevision(tx, projectId, request.expectedRevision, timestamp))) {
        throw revisionConflict((await repo.findProject(tx, projectId))?.revision ?? project.revision);
      }
      await repo.updateScenarioContent(tx, {
        id: scenarioId,
        projectId,
        name: request.name,
        notes: request.notes,
        workbook,
        assumptions,
        calculation,
        updatedAt: timestamp,
      });
    });
    return this.getProject(projectId);
  }
}

export async function projectService(): Promise<ProjectService> {
  return new ProjectService(await getDatabase());
}

/** Input labels by key, for messages and explanations. */
export const INPUT_LABELS: Record<string, string> = Object.fromEntries(BAKERY_INPUTS.map((i) => [i.key, i.label]));
