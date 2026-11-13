import { analysisReportRequestSchema } from '@/lib/contracts/analysis';
import { AnalysisReportService } from '@/server/analysis-report';
import { getDatabase } from '@/server/db';
import { ok, readJson } from '@/server/http';
import { withVisitor } from '@/server/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return withVisitor(request, async (visitor) => {
    const { projectId } = await context.params;
    const body = await readJson(request, analysisReportRequestSchema);
    return ok(await new AnalysisReportService(await getDatabase(), visitor.ownerHash).report(projectId, body));
  });
}
