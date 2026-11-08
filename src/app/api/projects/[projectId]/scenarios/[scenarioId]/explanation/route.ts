import { explanationRequestSchema } from '@/lib/contracts/project';
import { explanationService } from '@/server/explanations';
import { handle, ok, readJson } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/:projectId/scenarios/:scenarioId/explanation
 * Ask Ling 3.2 Flash to explain a saved scenario. The response names the
 * project revision it describes; any later save makes it stale.
 */
export async function POST(request: Request, context: { params: Promise<{ projectId: string; scenarioId: string }> }) {
  return handle(async () => {
    const { projectId, scenarioId } = await context.params;
    const body = await readJson(request, explanationRequestSchema);
    return ok(await explanationService().explain(projectId, scenarioId, body));
  });
}
