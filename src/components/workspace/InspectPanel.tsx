'use client';
import { useEffect } from 'react';
import { formatMargin, formatMoney, formatNumber } from '@/lib/format';
import type { Inspection } from '@/lib/univer/inspect';
import { isMoneyInput } from './types';

function show(key: string, value: number | null, currency: string): string {
  if (key === 'marginFraction') return formatMargin(value);
  if (key === 'monthlyUnits') return `${formatNumber(value)} units`;
  return isMoneyInput(key) ? formatMoney(value, currency) : formatNumber(value);
}

/** Slides in when a result is clicked; nothing is shown otherwise. Escape closes it. */
export function InspectPanel({
  inspection,
  contextLabel,
  currency,
  onClose,
}: {
  inspection: Inspection;
  contextLabel: string;
  currency: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const directInputs = new Set(inspection.references.filter((r) => r.kind === 'input').map((r) => r.key));
  return (
    <aside className="card panel inspect inspect-drawer" aria-live="polite" aria-label={`How ${inspection.label} is calculated`}>
      <div className="panel-head">
        <div className="stack" style={{ gap: 2 }}>
          <h3>
            {inspection.label} <span className="mono muted small">{inspection.cell}</span>
          </h3>
          <span className="tiny muted">{contextLabel}</span>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="panel-body">
        <strong className="num" style={{ fontSize: '1.4rem' }}>
          {show(inspection.key, inspection.value, currency)}
        </strong>
        {inspection.key === 'marginFraction' && inspection.value === null && (
          <span className="small muted">Revenue is zero, so the margin is not defined.</span>
        )}
        <div className="formula">{inspection.formula}</div>
        <table>
          <caption className="sr-only">Cells the formula refers to</caption>
          <tbody>
            {inspection.references.map((r) => (
              <tr key={r.cell}>
                <td>{r.label}</td>
                <td className="mono">{r.cell}</td>
                <td className="v">{show(r.key, r.value, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {inspection.contributingInputs.some((c) => !directInputs.has(c.key)) && (
          <table>
            <caption className="tiny muted" style={{ textAlign: 'left', paddingBottom: 4 }}>
              Inputs behind it
            </caption>
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
    </aside>
  );
}
