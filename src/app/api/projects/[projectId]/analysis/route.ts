import { analysisRequestSchema } from '@/lib/contracts/analysis';
import { AnalysisService } from '@/server/analysis';
import { getDatabase } from '@/server/db';
import { ok, readJson } from '@/server/http';
import { withVisitor } from '@/server/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return withVisitor(request, async (visitor) => {
    const { projectId } = await context.params;
    const body = await readJson(request, analysisRequestSchema);
    return ok(await new AnalysisService(await getDatabase(), visitor.ownerHash).analyse(projectId, body));
  });
}
