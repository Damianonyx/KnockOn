'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api/client';
import type { BrowserWorkbookAdapter } from '@/lib/univer/browser/adapter';

interface Props {
  adapter: BrowserWorkbookAdapter | null;
  projectId: string;
  scenarioId: string;
  revision: number;
  loading: boolean;
  dirty: boolean;
  readOnly: boolean;
  valid: boolean;
  chartCount: number;
}

export function ScenarioTools({ adapter, projectId, scenarioId, revision, loading, dirty, readOnly, valid, chartCount }: Props) {
  const [busy, setBusy] = useState<'chart' | 'print' | 'export' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = Boolean(adapter) && !loading && !busy;

  async function run(action: 'chart' | 'print' | 'export') {
    if (!ready || !adapter) return;
    setError(null);
    setBusy(action);
    try {
      if (action === 'chart') await adapter.addOverheadChart();
      if (action === 'print') await adapter.printScenario();
      if (action === 'export') {
        const { blob, filename } = await api.exportScenario(projectId, scenarioId, revision);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Give the browser time to start the download before releasing the object URL.
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="scenario-tools">
      <div className="row scenario-tools-actions" aria-label="Worksheet tools">
        {chartCount > 0 ? (
          <>
            <button type="button" className="btn btn-sm" disabled={!ready} onClick={() => adapter?.showChart()}>Show chart</button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={!ready} onClick={() => adapter?.showInputs()}>Show inputs</button>
          </>
        ) : (
          <button type="button" className="btn btn-sm" disabled={!ready || readOnly || !valid} onClick={() => void run('chart')}
            title={readOnly ? 'This baseline is frozen. Add a chart to a shock or response.' : 'Chart monthly energy, rent, wages, delivery and other costs.'}>
            {busy === 'chart' ? 'Adding chart…' : 'Add overhead chart'}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn-sm" disabled={!ready || !valid} onClick={() => void run('print')}>
          {busy === 'print' ? 'Preparing…' : 'Print / PDF'}
        </button>
        <button type="button" className="btn btn-sm" disabled={!ready || dirty || !valid} onClick={() => void run('export')}
          aria-describedby={dirty ? 'export-hint' : undefined}>
          {busy === 'export' ? 'Exporting…' : 'Export Excel'}
        </button>
      </div>
      {dirty && <p id="export-hint" className="tiny muted">Save changes to export the latest scenario to Excel.</p>}
      {error && <p className="small scenario-tools-error" role="alert">{error}</p>}
    </div>
  );
}
