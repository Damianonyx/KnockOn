import type { IWorkbookData } from '@univerjs/core';
import type { Project, Scenario } from '@/lib/contracts/project';
import { getDatabase, type Sql } from './db';
import { ApiError, notFound, revisionConflict } from './errors';
import { ProjectService } from './projects';

export type WorkbookConverter = (workbook: IWorkbookData) => Promise<Buffer>;

/** Vercel delegates native conversion to a private service with persistent SDK usage storage. */
export function createRemoteWorkbookConverter(url: string, token: string, fetcher: typeof fetch = fetch): WorkbookConverter {
  return async (workbook) => {
    let endpoint: URL;
    try {
      endpoint = new URL(url);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
      if ((endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:')) || endpoint.username || endpoint.password || endpoint.hash || token.length < 32) throw new Error('Invalid configuration');
    } catch {
      throw new ApiError(503, 'EXPORT_UNAVAILABLE', 'Excel export is temporarily unavailable. Please try again later.');
    }
    let response: Response;
    try {
      response = await fetcher(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workbook }),
        signal: AbortSignal.timeout(55_000),
        redirect: 'error',
        cache: 'no-store',
      });
    } catch {
      throw new ApiError(503, 'EXPORT_UNAVAILABLE', 'The Excel service is unavailable. Please try again later.');
    }
    if (!response.ok) {
      // No automatic retries: a conversion may already have consumed licensed usage.
      if ([401, 403, 429, 503].includes(response.status)) throw new ApiError(503, 'EXPORT_UNAVAILABLE', 'Excel export is temporarily unavailable. Please try again later.');
      throw new ApiError(502, 'EXPORT_FAILED', 'The Excel file could not be created. Your saved scenario is unchanged.');
    }
    if (!response.headers.get('content-type')?.includes('spreadsheetml.sheet')) throw new ApiError(502, 'EXPORT_FAILED', 'The Excel service returned an invalid file.');
    try {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 4 || buffer.subarray(0, 2).toString() !== 'PK') throw new Error('Invalid workbook');
      return buffer;
    } catch {
      throw new ApiError(502, 'EXPORT_FAILED', 'The Excel download was interrupted. Please try again later.');
    }
  };
}

export const convertWorkbookToExcel: WorkbookConverter = (workbook) =>
  createRemoteWorkbookConverter(process.env.UNIVER_EXPORT_URL?.trim() ?? '', process.env.UNIVER_EXPORT_TOKEN?.trim() ?? '')(workbook);

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
