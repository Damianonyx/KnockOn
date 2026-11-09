import { createProjectRequestSchema } from '@/lib/contracts/project';
import { ok, readJson } from '@/server/http';
import { projectService } from '@/server/projects';
import { withVisitor } from '@/server/visitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/projects: this visitor's project summaries, most recently updated first. */
export async function GET(request: Request) {
  return withVisitor(request, async (visitor) => ok(await (await projectService(visitor.ownerHash)).listProjects()));
}

/** POST /api/projects: create a project with one editable baseline. */
export async function POST(request: Request) {
  return withVisitor(request, async (visitor) => {
    const body = await readJson(request, createProjectRequestSchema);
    return ok(await (await projectService(visitor.ownerHash)).createProject(body), 201);
  });
}
