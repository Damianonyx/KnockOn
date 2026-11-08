import { Workspace } from '@/components/workspace/Workspace';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Project' };

/**
 * Server component: reads UNIVER_LICENSE (license.txt contents) and hands only
 * that value to the browser editor, as Univer's Web SDK requires. Server-only
 * secrets (UNIVER_LICENSE_KEY, ANTLING_API_KEY) are never read here.
 */
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const univerLicense = process.env.UNIVER_LICENSE?.trim() ?? '';
  return <Workspace projectId={projectId} univerLicense={univerLicense} />;
}
