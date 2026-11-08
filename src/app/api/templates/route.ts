import { TEMPLATES } from '@/lib/templates';
import { handle, ok } from '@/server/http';

export const runtime = 'nodejs';

/** GET /api/templates: template descriptors with input mappings, formulas, and simplifications. */
export async function GET() {
  return handle(() => ok(TEMPLATES));
}
