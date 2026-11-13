'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api/client';
import type { AnalysisReport, AnalysisReportRequest } from '@/lib/contracts/analysis';
import type { BrowserWorkbookAdapter } from '@/lib/univer/browser/adapter';
import { AppHeader } from '@/components/ui/AppHeader';

const SpreadsheetEditor = dynamic(() => import('./SpreadsheetEditor'), { ssr: false });

/** Separate tab/Univer instance: previewing a report cannot disturb a draft in the project tab. */
export function AnalysisReportPage({ projectId, request, license }: {
  projectId: string; request: AnalysisReportRequest | null; license: string;
}) {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [adapter, setAdapter] = useState<BrowserWorkbookAdapter | null>(null);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState(request ? '' : 'This report link is incomplete. Return to the project and run analysis again.');
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    api.analysisReport(projectId, request).then((result) => { if (!cancelled) setReport(result); })
      .catch((error) => { if (!cancelled) setProblem(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [projectId, request]);
  useEffect(() => {
    if (!adapter || !report) return;
    let cancelled = false;
    setReady(false);
    void (async () => {
      try {
        await adapter.load(report.workbook);
        if (cancelled) return;
        setReady(true);
        await adapter.printScenario();
      } catch (error) { if (!cancelled) setProblem(errorMessage(error)); }
    })();
    return () => { cancelled = true; };
  }, [adapter, report]);
  async function print() {
    if (!ready || !adapter || printing) return;
    setPrinting(true); setProblem('');
    try { await adapter.printScenario(); }
    catch (error) { setProblem(errorMessage(error)); }
    finally { setPrinting(false); }
  }
  return <>
    <AppHeader><Link href={`/projects/${encodeURIComponent(projectId)}#analysis`} className="header-link">Back to project</Link></AppHeader>
    <main className="page stack" style={{ maxWidth: 1200, gap: 16 }}>
      <h1>Analysis report</h1>
      {report && <p>{report.projectName} · {report.scenarioName} · saved revision {report.projectRevision}</p>}
      <p className="small muted">Choose your paper settings in the print preview, then select NEXT. In the browser’s print dialog, choose Save as PDF or a printer. This report contains saved figures; unsaved edits in the project are excluded.</p>
      <div className="row"><button type="button" className="btn btn-primary" disabled={!ready || printing} onClick={() => void print()}>{printing ? 'Preparing…' : 'Print / PDF'}</button></div>
      {problem && <p role="alert" className="banner banner-error">{problem}</p>}
      {!ready && !problem && <p role="status">Preparing your analysis report…</p>}
      {report && <div className="card" style={{ height: '70vh', minHeight: 440, overflow: 'hidden' }} data-report-ready={ready}>
        <SpreadsheetEditor report license={license} onReady={setAdapter} onError={setProblem} />
      </div>}
    </main>
  </>;
}
