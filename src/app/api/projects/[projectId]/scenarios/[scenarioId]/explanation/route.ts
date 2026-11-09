import { explanationRequestSchema } from '@/lib/contracts/project';
import { explanationService } from '@/server/explanations';
import { ok, readJson } from '@/server/http';
import { withVisitor } from '@/server/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/:projectId/scenarios/:scenarioId/explanation
 * Ask Ling 3.2 Flash to explain a saved scenario. The response names the
 * project revision it describes; any later save makes it stale.
 */
export async function POST(request: Request, context: { params: Promise<{ projectId: string; scenarioId: string }> }) {
  return withVisitor(request, async (visitor) => {
    const { projectId, scenarioId } = await context.params;
    const body = await readJson(request, explanationRequestSchema);
    return ok(await (await explanationService(visitor)).explain(projectId, scenarioId, body));
  });
}
