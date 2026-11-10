import type { IWorkbookData } from '@univerjs/core';
import { UniverInstanceType } from '@univerjs/core';
import type { Project, Scenario } from '@/lib/contracts/project';
import { getDatabase, type Sql } from './db';
import { ApiError, notFound, revisionConflict } from './errors';
import { ProjectService } from './projects';

export type WorkbookConverter = (workbook: IWorkbookData) => Promise<Buffer>;

/** Native Exchange stays on the server. A missing/expired commercial license never falls back to Free. */
export const convertWorkbookToExcel: WorkbookConverter = async (workbook) => {
  const license = process.env.UNIVER_LICENSE?.trim();
  const licenseKey = process.env.UNIVER_LICENSE_KEY?.trim();
  if (!license || !licenseKey) throw new ApiError(503, 'EXPORT_UNAVAILABLE', 'Excel export is not configured yet. Please try again later.');
  try {
    const { exportToBuffer, ExchangeFormat, FormulaCalculationMode, getExportQuota } = await import('@univerjs-pro/exchange-node');
    const credentials = { license, licenseKey };
    const quota = await getExportQuota(credentials);
    if (quota.licenseStatus !== 'valid') throw new ApiError(503, 'EXPORT_UNAVAILABLE', 'Excel export is temporarily unavailable while the license is renewed.');
    // Vercel has no durable local disk. Only unlimited subscriptions can run here;
    // metered export needs a persistent server for Univer's shared usage ledger.
    if (process.env.VERCEL && quota.limit !== null) throw new ApiError(503, 'EXPORT_UNAVAILABLE', 'Excel export is temporarily unavailable. Please contact the site owner.');
    return await exportToBuffer(workbook, {
      ...credentials,
      type: UniverInstanceType.UNIVER_SHEET,
      format: ExchangeFormat.XLSX,
      // The saved workbook already has authoritative results from the server's Univer engine.
      formulaCalculation: FormulaCalculationMode.NO,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN';
    // Provider messages may contain paths or configuration: log a code, never supplied credentials or workbook contents.
    console.error(`[knockon] Excel export failed (${code})`);
    if (code.startsWith('LICENSE_') || code === 'NATIVE_LOAD_FAILED') {
      throw new ApiError(503, 'EXPORT_UNAVAILABLE', 'Excel export is temporarily unavailable. Please try again later.');
    }
    throw new ApiError(502, 'EXPORT_FAILED', 'The Excel file could not be created. Your saved scenario is unchanged.');
  }
};

export function excelFilename(project: Pick<Project, 'name' | 'revision'>, scenario: Pick<Scenario, 'name'>): string {
  const clean = (value: string) => value.normalize('NFKD').replace(/[^a-zA-Z0-9 -]/g, '').trim().replace(/\s+/g, '-').slice(0, 65) || 'scenario';
  return `${clean(project.name)}-${clean(scenario.name)}-r${project.revision}.xlsx`;
}

/** Export only the visitor's saved scenario at the revision they requested; no client workbook is accepted. */
export class ExportService {
  constructor(private readonly db: Sql, private readonly ownerHash: string, private readonly convert: WorkbookConverter = convertWorkbookToExcel) {}

  async exportScenario(projectId: string, scenarioId: string, expectedRevision: number) {
    const project = await new ProjectService(this.db, this.ownerHash).getProject(projectId);
    const scenario = project.scenarios.find((s) => s.id === scenarioId);
    if (!scenario) throw notFound('Scenario');
    if (project.revision !== expectedRevision) throw revisionConflict(project.revision);
    if (scenario.calculation.status !== 'valid') throw new ApiError(422, 'CALCULATION_ERROR', 'Fix the scenario’s inputs and save before exporting.');
    const workbook = structuredClone(scenario.workbook) as unknown as IWorkbookData;
    workbook.name = `${project.name} — ${scenario.name}`;
    const buffer = await this.convert(workbook);
    return { buffer, filename: excelFilename(project, scenario), revision: project.revision };
  }
}

export async function exportService(ownerHash: string): Promise<ExportService> {
  return new ExportService(await getDatabase(), ownerHash);
}
