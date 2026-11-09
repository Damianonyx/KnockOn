import { ok } from '@/server/http';
import { projectService } from '@/server/projects';
import { withVisitor } from '@/server/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/projects/:projectId: the complete project with scenario workbooks and calculations. */
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return withVisitor(request, async (visitor) => {
    const { projectId } = await context.params;
    return ok(await (await projectService(visitor.ownerHash)).getProject(projectId));
  });
}
