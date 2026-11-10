/**
 * API errors with the shape documented in docs/API_CONTRACT.md, "Errors and
 * recovery". Services throw ApiError; route handlers turn it into JSON.
 */
import type { CalculationError } from '@/lib/contracts/project';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'BASELINE_FROZEN'
  | 'INVALID_FORK'
  | 'VALIDATION_ERROR'
  | 'ASSUMPTION_REQUIRED'
  | 'CALCULATION_ERROR'
  | 'EXPLANATION_UNAVAILABLE'
  | 'EXPLANATION_FAILED'
  | 'EXPORT_UNAVAILABLE'
  | 'EXPORT_FAILED'
  | 'DATABASE_NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ApiErrorDetails {
  fields?: Record<string, string>;
  currentRevision?: number;
  invalidCells?: CalculationError[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details: ApiErrorDetails = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toBody() {
    return { error: { code: this.code, message: this.message, ...this.details } };
  }
}

export const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', `${what} was not found.`);

export const revisionConflict = (currentRevision: number) =>
  new ApiError(
    409,
    'REVISION_CONFLICT',
    'This project changed since you loaded it. Reload the latest version; your draft has not been saved.',
    { currentRevision },
  );
