import { updateScenarioRequestSchema } from '@/lib/contracts/project';
import { handle, ok, readJson } from '@/server/http';
import { projectService } from '@/server/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PUT /api/projects/:projectId/scenarios/:scenarioId: save a scenario; the server recalculates it. */
export async function PUT(request: Request, context: { params: Promise<{ projectId: string; scenarioId: string }> }) {
  return handle(async () => {
    const { projectId, scenarioId } = await context.params;
    const body = await readJson(request, updateScenarioRequestSchema);
    return ok(await (await projectService()).updateScenario(projectId, scenarioId, body));
  });
}
