import { NextResponse } from 'next/server';
import { analysisReportRequestSchema } from '@/lib/contracts/analysis';
import { AnalysisReportService } from '@/server/analysis-report';
import { getDatabase } from '@/server/db';
import { readJson } from '@/server/http';
import { withVisitor } from '@/server/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return withVisitor(request, async (visitor) => {
    const { projectId } = await context.params;
    const body = await readJson(request, analysisReportRequestSchema);
    const file = await new AnalysisReportService(await getDatabase(), visitor.ownerHash).export(projectId, body);
    return new NextResponse(new Uint8Array(file.buffer), { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-KnockOn-Revision': String(file.revision),
    } });
  });
}
