import { AnalysisReportPage } from '@/components/workspace/AnalysisReportPage';
import { analysisReportRequestSchema } from '@/lib/contracts/analysis';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analysis report', robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: {
  params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const value = (key: string) => typeof query[key] === 'string' ? query[key] : undefined;
  const parsed = analysisReportRequestSchema.safeParse({ scenarioId: value('scenarioId'), expectedRevision: Number(value('expectedRevision')),
    minUnits: Number(value('minUnits')), maxUnits: Number(value('maxUnits')) });
  return <AnalysisReportPage projectId={projectId} request={parsed.success ? parsed.data : null} license={process.env.UNIVER_LICENSE?.trim() ?? ''} />;
}
