/**
 * Browser client for the KnockOn API (docs/API_CONTRACT.md).
 *
 * Every call returns the `data` envelope or throws ApiClientError carrying the
 * documented error code, field messages, current revision, and invalid cells.
 * Network failures and timeouts become `NETWORK_ERROR` so the UI never shows
 * "Saved" for a request that did not complete.
 */
import type {
  CalculationError,
  CreateProjectRequest,
  Explanation,
  ForkScenarioRequest,
  Project,
  ProjectSummary,
  UpdateScenarioRequest,
} from '@/lib/contracts/project';
import type { TemplateDescriptor } from '@/lib/templates';
import type { AnalysisRequest, ProjectAnalysis } from '@/lib/contracts/analysis';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
    public readonly currentRevision?: number,
    public readonly invalidCells: CalculationError[] = [],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  get isNetwork(): boolean {
    return this.code === 'NETWORK_ERROR';
  }
  get isConflict(): boolean {
    return this.code === 'REVISION_CONFLICT';
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

async function request<T>(method: string, path: string, body?: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      timedOut
        ? 'The server did not respond in time. Your draft is kept; check the connection and try again.'
        : 'Could not reach the server. Your draft is kept; check the connection and try again.',
    );
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // Fall through: a non-JSON body is reported below.
  }

  if (!response.ok) {
    const err = (json as { error?: Record<string, unknown> } | null)?.error;
    if (err && typeof err.code === 'string') {
      throw new ApiClientError(
        response.status,
        err.code,
        typeof err.message === 'string' ? err.message : 'The request failed.',
        (err.fields as Record<string, string>) ?? {},
        typeof err.currentRevision === 'number' ? err.currentRevision : undefined,
        (err.invalidCells as CalculationError[]) ?? [],
      );
    }
    throw new ApiClientError(response.status, 'HTTP_ERROR', `The server returned HTTP ${response.status}.`);
  }
  if (!json || typeof json !== 'object' || !('data' in json)) {
    throw new ApiClientError(response.status, 'BAD_RESPONSE', 'The server returned an unexpected response.');
  }
  return (json as { data: T }).data;
}

export const api = {
  analyse: (projectId: string, body: AnalysisRequest) =>
    request<ProjectAnalysis>('POST', `/api/projects/${encodeURIComponent(projectId)}/analysis`, body),
  listTemplates: () => request<TemplateDescriptor[]>('GET', '/api/templates'),
  listProjects: () => request<ProjectSummary[]>('GET', '/api/projects'),
  createProject: (body: CreateProjectRequest) => request<Project>('POST', '/api/projects', body),
  getProject: (projectId: string) => request<Project>('GET', `/api/projects/${encodeURIComponent(projectId)}`),
  exportScenario: async (projectId: string, scenarioId: string, expectedRevision: number): Promise<{ blob: Blob; filename: string }> => {
    let response: Response;
    try {
      response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/scenarios/${encodeURIComponent(scenarioId)}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision }),
        cache: 'no-store',
        signal: AbortSignal.timeout(65_000),
      });
    } catch {
      throw new ApiClientError(0, 'NETWORK_ERROR', 'Could not download the Excel file. Check the connection and try again.');
    }
    if (!response.ok) {
      const json = await response.json().catch(() => null);
      throw new ApiClientError(response.status, json?.error?.code ?? 'EXPORT_FAILED', json?.error?.message ?? 'The Excel download failed.');
    }
    if (!response.headers.get('content-type')?.includes('spreadsheetml.sheet')) throw new ApiClientError(response.status, 'BAD_RESPONSE', 'The server did not return an Excel file.');
    const filename = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'KnockOn-scenario.xlsx';
    return { blob: await response.blob(), filename };
  },
  forkScenario: (projectId: string, body: ForkScenarioRequest) =>
    request<Project>('POST', `/api/projects/${encodeURIComponent(projectId)}/scenarios`, body),
  saveScenario: (projectId: string, scenarioId: string, body: UpdateScenarioRequest) =>
    request<Project>(
      'PUT',
      `/api/projects/${encodeURIComponent(projectId)}/scenarios/${encodeURIComponent(scenarioId)}`,
      body,
    ),
  explain: (projectId: string, scenarioId: string, body: { expectedRevision: number; question?: string }) =>
    request<Explanation>(
      'POST',
      `/api/projects/${encodeURIComponent(projectId)}/scenarios/${encodeURIComponent(scenarioId)}/explanation`,
      body,
      // Ling can take a while; the server gives up after 60 seconds.
      75_000,
    ),
};

/** A user-facing sentence for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
