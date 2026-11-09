import { updateScenarioRequestSchema } from '@/lib/contracts/project';
import { ok, readJson } from '@/server/http';
import { projectService } from '@/server/projects';
import { withVisitor } from '@/server/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PUT /api/projects/:projectId/scenarios/:scenarioId: save a scenario; the server recalculates it. */
export async function PUT(request: Request, context: { params: Promise<{ projectId: string; scenarioId: string }> }) {
  return withVisitor(request, async (visitor) => {
    const { projectId, scenarioId } = await context.params;
    const body = await readJson(request, updateScenarioRequestSchema);
    return ok(await (await projectService(visitor.ownerHash)).updateScenario(projectId, scenarioId, body));
  });
}
