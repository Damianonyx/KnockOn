'use client';
/**
 * Ling 3.2 Flash explanation of the saved scenario, in the same slide-in panel
 * as result inspection. It explains; it never decides or recalculates. An
 * explanation describes one saved project revision and is marked out of date
 * as soon as anything in the project is saved again.
 */
import { useEffect } from 'react';
import type { Explanation } from '@/lib/contracts/project';
import { formatMoney, formatNumber } from '@/lib/format';

export type ExplainState =
  | { status: 'loading' }
  | { status: 'ready'; explanation: Explanation }
  | { status: 'error'; title: string; message: string; retry: boolean };

function Paragraphs({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="explain-text">
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        const bullet = /^\s*[-*•]\s+/;
        // A list, optionally with a lead-in line such as "How it flows:".
        const lead = bullet.test(lines[0]) ? null : lines[0];
        const items = lead === null ? lines : lines.slice(1);
        if (items.length > 0 && items.every((l) => bullet.test(l))) {
          return (
            <div key={i}>
              {lead && <p>{lead}</p>}
              <ul>
                {items.map((l, j) => (
                  <li key={j}>{l.replace(bullet, '')}</li>
                ))}
              </ul>
            </div>
          );
        }
        return <p key={i}>{block}</p>;
      })}
    </div>
  );
}

export function ExplainPanel({
  state,
  scenarioName,
  currentRevision,
  currency,
  onRetry,
  onClose,
}: {
  state: ExplainState;
  scenarioName: string;
  currentRevision: number;
  currency: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stale = state.status === 'ready' && state.explanation.projectRevision !== currentRevision;
  const show = (key: string, v: number | null) => (key === 'monthlyUnits' ? `${formatNumber(v)} units` : formatMoney(v, currency));

  return (
    <aside className="card panel inspect inspect-drawer" aria-live="polite" aria-label={`Explanation of ${scenarioName}`}>
      <div className="panel-head">
        <div className="stack" style={{ gap: 2 }}>
          <h3>Why the numbers look like this</h3>
          <span className="tiny muted">{scenarioName} · explained by Ling 3.2 Flash</span>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="panel-body">
        {state.status === 'loading' && (
          <div className="center-state" role="status" style={{ padding: '28px 8px' }}>
            <span className="spinner" aria-hidden />
            <span>Ling is reading the saved spreadsheet…</span>
            <span className="tiny muted">This usually takes about 10 seconds.</span>
          </div>
        )}
        {state.status === 'error' && (
          <div className="banner banner-error" role="alert">
            <div className="banner-body">
              <strong>{state.title}</strong>
              <span>{state.message}</span>
              <span className="tiny">The spreadsheet and every result still work.</span>
              {state.retry && (
                <div className="banner-actions">
                  <button type="button" className="btn btn-sm" onClick={onRetry}>
                    Try again
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {state.status === 'ready' && (
          <>
            {stale && (
              <div className="banner banner-warn" role="status">
                <div className="banner-body">
                  <span>The project changed since this explanation.</span>
                  <div className="banner-actions">
                    <button type="button" className="btn btn-sm" onClick={onRetry}>
                      Explain again
                    </button>
                  </div>
                </div>
              </div>
            )}
            {state.explanation.changedInputs.length > 0 && (
              <ul className="assumption-list">
                {state.explanation.changedInputs.map((c) => (
                  <li key={c.inputKey}>
                    <span className="mono">{c.cell}</span> {c.label}: {show(c.inputKey, c.from)} → {show(c.inputKey, c.to)}
                  </li>
                ))}
              </ul>
            )}
            <Paragraphs text={state.explanation.explanation} />
            <p className="tiny muted">
              Ling explains the saved figures; it doesn’t recalculate them or make the decision for you. Check anything important
              against the formulas.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
