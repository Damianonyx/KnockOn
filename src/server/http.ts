/**
 * Shared helpers for route handlers: JSON parsing with size limits, schema
 * validation, the `{ data }` success envelope, and error mapping.
 */
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { MAX_REQUEST_BYTES } from '@/lib/contracts/project';
import { ApiError } from './errors';

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function issuePath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? 'body' : path.map(String).join('.');
}

/** Read and validate a JSON body. Malformed JSON or shape errors are 400; oversized bodies are 413. */
export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  // Only JSON bodies: a cross-site HTML form cannot send this content type.
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'BAD_REQUEST', 'Send the request body as JSON (Content-Type: application/json).');
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_REQUEST_BYTES) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
  }
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_REQUEST_BYTES) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'BAD_REQUEST', 'The request body must be valid JSON.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issuePath(issue.path);
      fields[key] ??= issue.message;
    }
    throw new ApiError(400, 'BAD_REQUEST', 'The request is missing fields or has fields of the wrong type.', { fields });
  }
  return parsed.data;
}

/** Run a handler, turning ApiError into its documented response and anything else into a generic 500. */
export async function handle(work: () => Promise<NextResponse> | NextResponse): Promise<NextResponse> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(error.toBody(), { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    }
    // Log the error type and message only: never request bodies, keys, or licenses.
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error';
    console.error(`[knockon] Unexpected API error: ${detail}`);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server. Your draft has not been saved; try again.' } },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
