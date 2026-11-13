/** Read-only analysis of saved scenarios. All business arithmetic runs in Univer. */
import { randomUUID } from 'node:crypto';
import { analysisRequestSchema, BREAK_EVEN_FORMULAS, sensitivityFormulas, type AnalysisRequest, type ProjectAnalysis, type ScenarioAnalysis } from '@/lib/contracts/analysis';
import type { Project } from '@/lib/contracts/project';
import { BAKERY_INPUTS, BAKERY_SHEET_ID, buildBakeryWorkbook, type BakeryInputKey } from '@/lib/templates/bakery';
import { calculateTrustedWorkbook } from '@/lib/univer/server/recalculate';
import { readBakeryInput, validateBakerySnapshot, type BakeryCellMatrix, type BakeryWorkbook } from '@/lib/univer/snapshot';
import { orderScenarios } from '@/lib/scenarios';
import { ProjectService } from './projects';
import { ApiError, revisionConflict } from './errors';
import type { Sql } from './db';

function calculationFailed(): never {
  throw new ApiError(422, 'CALCULATION_ERROR', 'This range could not be calculated. Check the saved inputs and try a smaller sales range.');
}

export async function calculateProjectAnalysisWorkbook(project: Project, request: AnalysisRequest): Promise<{ analysis: ProjectAnalysis; workbook: BakeryWorkbook }> {
  const scenarios = orderScenarios(project);
  const steps = Math.min(10, request.maxUnits - request.minUnits);
  const sheets: BakeryWorkbook['sheets'] = {};
  const inputsById = new Map<string, Record<BakeryInputKey, number>>();
  scenarios.forEach((scenario, index) => {
    const valid = validateBakerySnapshot(scenario.workbook);
    if (!valid.ok) calculationFailed();
    const inputs = Object.fromEntries(BAKERY_INPUTS.map((i) => [i.key, readBakeryInput(valid.workbook, i.key)])) as Record<BakeryInputKey, number>;
    inputsById.set(scenario.id, inputs);
    // Construct fresh cells from validated saved inputs, never from cached client results or chart resources.
    const built = buildBakeryWorkbook(inputs, 'analysis') as unknown as BakeryWorkbook;
    const sheet = built.sheets[BAKERY_SHEET_ID];
    const cells = sheet.cellData!;
    cells[17] = { 0: { v: 'Contribution per unit' }, 1: { f: BREAK_EVEN_FORMULAS.B18 } };
    cells[18] = { 0: { v: 'Minimum whole units to cover costs' }, 1: { f: BREAK_EVEN_FORMULAS.B19 } };
    cells[1][4] = { v: request.minUnits };
    cells[2][4] = { v: request.maxUnits };
    for (let i = 0; i <= steps; i++) {
      const row = 24 + i;
      const formulas = sensitivityFormulas(row);
      cells[row - 1] = {
        0: { f: `=ROUND($E$2+($E$3-$E$2)*${i}/${steps},0)` },
        1: { f: formulas.revenue },
        2: { f: formulas.totalCosts },
        3: { f: formulas.profit },
      };
    }
    const id = `analysis_${index}`;
    sheets[id] = { ...sheet, id, name: id, rowCount: 40, columnCount: 5 };
  });
  const calculated = await calculateTrustedWorkbook({ id: `analysis_${randomUUID()}`, sheetOrder: Object.keys(sheets), sheets });
  const numberAt = (cells: BakeryCellMatrix, row: number, col: number): number => {
    const value = cells[row - 1]?.[col]?.v;
    if (typeof value !== 'number' || !Number.isFinite(value)) calculationFailed();
    // Univer can emit -0 for ROUNDUP(0, 0); expose a plain zero to the interface.
    return Object.is(value, -0) ? 0 : value;
  };
  const results: ScenarioAnalysis[] = scenarios.map((scenario, index) => {
    const cells = calculated.sheets[`analysis_${index}`].cellData!;
    const fixedCosts = numberAt(cells, 13, 1);
    const contributionPerUnit = numberAt(cells, 18, 1);
    const rawThreshold = cells[18]?.[1]?.v;
    const breakEvenUnits = rawThreshold === '' ? null : numberAt(cells, 19, 1);
    const breakEvenStatus = contributionPerUnit > 0 ? 'attainable'
      : fixedCosts > 0 ? 'unreachable'
      : contributionPerUnit === 0 ? 'any-volume' : 'zero-sales-only';
    return {
      scenarioId: scenario.id, name: scenario.name, kind: scenario.kind, inputs: inputsById.get(scenario.id)!,
      fixedCosts, contributionPerUnit, breakEvenUnits, breakEvenStatus,
      points: Array.from({ length: steps + 1 }, (_, i) => ({
        row: 24 + i, units: numberAt(cells, 24 + i, 0), revenue: numberAt(cells, 24 + i, 1),
        totalCosts: numberAt(cells, 24 + i, 2), profit: numberAt(cells, 24 + i, 3),
      })),
    };
  });
  return { analysis: { projectId: project.id, projectRevision: project.revision, minUnits: request.minUnits, maxUnits: request.maxUnits, scenarios: results }, workbook: calculated };
}

export async function calculateProjectAnalysis(project: Project, request: AnalysisRequest): Promise<ProjectAnalysis> {
  return (await calculateProjectAnalysisWorkbook(project, request)).analysis;
}

export class AnalysisService {
  private readonly projects: ProjectService;
  constructor(db: Sql, ownerHash: string) { this.projects = new ProjectService(db, ownerHash); }

  async analyse(projectId: string, request: AnalysisRequest): Promise<ProjectAnalysis> {
    const parsed = analysisRequestSchema.safeParse(request);
    if (!parsed.success) throw new ApiError(400, 'BAD_REQUEST', 'Enter a whole-number sales range between 0 and 1,000,000,000, with maximum greater than minimum.');
    const project = await this.projects.getProject(projectId);
    if (project.revision !== request.expectedRevision) throw revisionConflict(project.revision);
    const result = await calculateProjectAnalysis(project, parsed.data);
    // A save in another tab during calculation must never produce an apparently current result.
    const latest = await this.projects.getProject(projectId);
    if (latest.revision !== request.expectedRevision) throw revisionConflict(latest.revision);
    return result;
  }
}
