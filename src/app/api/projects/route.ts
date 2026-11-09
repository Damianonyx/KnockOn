import { createProjectRequestSchema } from '@/lib/contracts/project';
import { handle, ok, readJson } from '@/server/http';
import { projectService } from '@/server/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/projects: project summaries, most recently updated first. */
export async function GET() {
  return handle(async () => ok(await (await projectService()).listProjects()));
}

/** POST /api/projects: create a project with one editable baseline. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request, createProjectRequestSchema);
    return ok(await (await projectService()).createProject(body), 201);
  });
}
