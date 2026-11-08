import { handle, ok } from '@/server/http';
import { projectService } from '@/server/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/projects/:projectId: the complete project with scenario workbooks and calculations. */
export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  return handle(async () => {
    const { projectId } = await context.params;
    return ok(projectService().getProject(projectId));
  });
}
