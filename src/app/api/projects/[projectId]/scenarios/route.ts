import { forkScenarioRequestSchema } from '@/lib/contracts/project';
import { handle, ok, readJson } from '@/server/http';
import { projectService } from '@/server/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/projects/:projectId/scenarios: fork a shock from the baseline or a response from a shock. */
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return handle(async () => {
    const { projectId } = await context.params;
    const body = await readJson(request, forkScenarioRequestSchema);
    return ok(await (await projectService()).forkScenario(projectId, body), 201);
  });
}
