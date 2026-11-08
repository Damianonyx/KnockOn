'use client';
import type { Project, Scenario } from '@/lib/contracts/project';
import { formatMoney } from '@/lib/format';
import { baselineOf, changeAgainst, orderScenarios } from '@/lib/scenarios';

/** Baseline, shocks and responses as an indented list, each with its saved profit and change. */
export function ScenarioList({
  project,
  activeId,
  dirtyId,
  onSelect,
}: {
  project: Project;
  activeId: string;
  dirtyId: string | null;
  onSelect: (s: Scenario) => void;
}) {
  const baseProfit = baselineOf(project)?.calculation.metrics.profit ?? null;
  return (
    <nav aria-label="Scenarios">
      <ul className="scenario-list">
        {orderScenarios(project).map((s) => {
          const indent = s.kind === 'shock' ? 'indent-1' : s.kind === 'response' ? 'indent-2' : '';
          const profit = s.calculation.metrics.profit ?? null;
          const change = s.kind === 'baseline' ? null : changeAgainst(profit, baseProfit);
          return (
            <li key={s.id}>
              <button type="button" className={`scenario-item ${indent}`} aria-current={s.id === activeId} onClick={() => onSelect(s)}>
                <span className="s-name">
                  {s.name}
                  {s.id === dirtyId && (
                    <span title="Unsaved changes" aria-label="unsaved changes" style={{ color: 'var(--accent)' }}>
                      ●
                    </span>
                  )}
                </span>
                <span className="s-meta num">
                  {typeof profit === 'number' && <span>{formatMoney(profit, project.currency)}</span>}
                  {change !== null && change !== 0 && (
                    <span className={change > 0 ? 'delta-pos' : 'delta-neg'}>{formatMoney(change, project.currency, { signed: true })}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
