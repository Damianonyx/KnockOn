'use client';
import { formatMargin, formatMoney, formatNumber } from '@/lib/format';
import type { Inspection } from '@/lib/univer/inspect';
import { isMoneyInput } from './types';

function show(key: string, value: number | null, currency: string): string {
  if (key === 'marginFraction') return formatMargin(value);
  if (key === 'monthlyUnits') return `${formatNumber(value)} units`;
  return isMoneyInput(key) ? formatMoney(value, currency) : formatNumber(value);
}

export function InspectPanel({
  inspection,
  contextLabel,
  currency,
  onClose,
}: {
  inspection: Inspection | null;
  contextLabel: string;
  currency: string;
  onClose?: () => void;
}) {
  if (!inspection) {
    return (
      <section className="card panel inspect" aria-label="Inspect a result">
        <div className="panel-head">
          <h3>Inspect</h3>
        </div>
        <div className="panel-body muted small">
          Click a result — a metric card, a comparison figure, or a result cell (B11–B16) in the spreadsheet — to see its
          formula and the inputs behind it.
        </div>
      </section>
    );
  }
  const directInputs = new Set(inspection.references.filter((r) => r.kind === 'input').map((r) => r.key));
  return (
    <section className="card panel inspect" aria-live="polite" aria-label={`Inspect ${inspection.label}`}>
      <div className="panel-head">
        <div className="stack" style={{ gap: 2 }}>
          <h3>
            {inspection.label} <span className="mono muted small">{inspection.cell}</span>
          </h3>
          <span className="tiny muted">{contextLabel}</span>
        </div>
        {onClose && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close inspector">
            ✕
          </button>
        )}
      </div>
      <div className="panel-body">
        <div className="stack" style={{ gap: 4 }}>
          <span className="tiny muted">Value calculated by Univer</span>
          <strong className="num" style={{ fontSize: '1.25rem' }}>
            {show(inspection.key, inspection.value, currency)}
          </strong>
          {inspection.key === 'marginFraction' && inspection.value === null && (
            <span className="small muted">Revenue is zero, so the formula returns a blank and the margin shows N/A.</span>
          )}
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <span className="tiny muted">Formula</span>
          <div className="formula">{inspection.formula}</div>
        </div>
        <table>
          <caption className="sr-only">Cells the formula refers to</caption>
          <thead>
            <tr>
              <th scope="col">Refers to</th>
              <th scope="col">Cell</th>
              <th scope="col" style={{ textAlign: 'right' }}>
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {inspection.references.map((r) => (
              <tr key={r.cell}>
                <td>
                  {r.label}
                  {r.kind === 'result' && <span className="tiny muted"> (formula)</span>}
                </td>
                <td className="mono">{r.cell}</td>
                <td className="v">{show(r.key, r.value, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {inspection.contributingInputs.some((c) => !directInputs.has(c.key)) && (
          <table>
            <caption className="sr-only">All inputs behind this result</caption>
            <thead>
              <tr>
                <th scope="col" colSpan={2}>
                  All inputs behind it
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {inspection.contributingInputs.map((c) => (
                <tr key={c.cell}>
                  <td>{c.label}</td>
                  <td className="mono">{c.cell}</td>
                  <td className="v">{show(c.key, c.value, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
