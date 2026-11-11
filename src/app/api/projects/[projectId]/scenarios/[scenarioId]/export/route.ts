import { NextResponse } from 'next/server';
import { z } from 'zod';
import { exportService } from '@/server/exports';
import { readJson } from '@/server/http';
import { withVisitor } from '@/server/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const requestSchema = z.object({ expectedRevision: z.number().int().positive() }).strict();

/** POST: download one saved, owned scenario as an Excel workbook. */
export async function POST(request: Request, context: { params: Promise<{ projectId: string; scenarioId: string }> }) {
  return withVisitor(request, async (visitor) => {
    const { projectId, scenarioId } = await context.params;
    const { expectedRevision } = await readJson(request, requestSchema);
    const file = await (await exportService(visitor.ownerHash)).exportScenario(projectId, scenarioId, expectedRevision);
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-KnockOn-Revision': String(file.revision),
      },
    });
  });
}
