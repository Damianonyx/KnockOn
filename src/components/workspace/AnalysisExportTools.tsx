'use client';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api/client';
import type { AnalysisReportRequest } from '@/lib/contracts/analysis';

/** Mounted with a revision/range/selection key: an obsolete request cannot download a stale report. */
export function AnalysisExportTools({ projectId, request, excelExportAvailable }: {
  projectId: string; request: AnalysisReportRequest; excelExportAvailable: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const query = new URLSearchParams({ scenarioId: request.scenarioId, expectedRevision: String(request.expectedRevision),
    minUnits: String(request.minUnits), maxUnits: String(request.maxUnits) });
  async function download() {
    if (busy) return;
    setBusy(true); setProblem('');
    try {
      const { blob, filename } = await api.exportAnalysis(projectId, request);
      if (!active.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { if (active.current) setProblem(errorMessage(error)); }
    finally { if (active.current) setBusy(false); }
  }
  return <div className="stack" style={{ gap: 8 }}>
    <div className="row" aria-label="Analysis exports">
      <a className="btn btn-sm" href={`/projects/${encodeURIComponent(projectId)}/analysis/print?${query}`} target="_blank" rel="noopener noreferrer">
        Print analysis / PDF<span className="sr-only"> (opens a new tab)</span>
      </a>
      <button className="btn btn-sm" type="button" disabled={busy || !excelExportAvailable} onClick={() => void download()}>
        {busy ? 'Exporting analysis…' : 'Export analysis Excel'}
      </button>
    </div>
    <p className="tiny muted">Report: all break-even thresholds, selected scenario’s chart and table, baseline comparison, saved inputs and assumptions.</p>
    {!excelExportAvailable && <p className="tiny muted">Excel export is temporarily unavailable. You can still print the analysis or save it as PDF.</p>}
    {problem && <p role="alert" className="error-text">{problem}</p>}
  </div>;
}
