import { forkScenarioRequestSchema } from '@/lib/contracts/project';
import { ok, readJson } from '@/server/http';
import { projectService } from '@/server/projects';
import { withVisitor } from '@/server/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/projects/:projectId/scenarios: fork a shock from the baseline or a response from a shock. */
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return withVisitor(request, async (visitor) => {
    const { projectId } = await context.params;
    const body = await readJson(request, forkScenarioRequestSchema);
    return ok(await (await projectService(visitor.ownerHash)).forkScenario(projectId, body), 201);
  });
}
