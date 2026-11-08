'use client';
import type { Project, Scenario } from '@/lib/contracts/project';
import { formatMoney } from '@/lib/format';
import { isReadOnly, KIND_LABEL, orderScenarios } from '@/lib/scenarios';

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
  return (
    <nav aria-label="Scenarios">
      <ul className="scenario-list">
        {orderScenarios(project).map((s) => {
          const indent = s.kind === 'shock' ? 'indent-1' : s.kind === 'response' ? 'indent-2' : '';
          const profit = s.calculation.metrics.profit;
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`scenario-item ${indent}`}
                aria-current={s.id === activeId}
                onClick={() => onSelect(s)}
              >
                <span className="s-name">
                  {s.name}
                  {s.id === dirtyId && (
                    <span title="Unsaved changes" aria-label="unsaved changes" style={{ color: 'var(--accent)' }}>
                      ●
                    </span>
                  )}
                </span>
                <span className="s-meta">
                  <span className={`badge badge-kind-${s.kind}`}>{KIND_LABEL[s.kind]}</span>
                  {isReadOnly(project, s) && <span className="badge badge-locked">🔒 Frozen</span>}
                  <span className="num">
                    {typeof profit === 'number' ? `${profit < 0 ? 'Loss' : 'Profit'} ${formatMoney(profit, project.currency)}` : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
