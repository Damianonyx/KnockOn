'use client';
import type { Project } from '@/lib/contracts/project';
import { formatMargin, formatMoney, formatNumber, outcomeLabel } from '@/lib/format';
import { baselineOf, changeAgainst, changedInputs, KIND_LABEL, orderScenarios, parentOf } from '@/lib/scenarios';
import type { BakeryResultKey } from '@/lib/templates/bakery';
import { ProfitChangeChart, ResultsBarChart, type ChartRow } from './Charts';
import { DeltaText } from './MetricCards';
import type { InspectTarget } from './types';

const COLUMNS: { key: BakeryResultKey; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'totalCosts', label: 'Total costs' },
  { key: 'profit', label: 'Profit' },
  { key: 'marginFraction', label: 'Margin' },
];

export function ComparisonView({
  project,
  inspect,
  dirtyName,
  onInspect,
}: {
  project: Project;
  inspect: InspectTarget | null;
  dirtyName: string | null;
  onInspect: (target: InspectTarget) => void;
}) {
  const scenarios = orderScenarios(project);
  const baseline = baselineOf(project);
  const baseProfit = baseline?.calculation.metrics.profit ?? null;

  return (
    <div className="stack" style={{ gap: 14 }}>
      {dirtyName && (
        <div className="banner banner-warn" role="status">
          <div className="banner-body">
            “{dirtyName}” has unsaved changes. The comparison shows saved, server-calculated results only; save to include
            your latest edits.
          </div>
        </div>
      )}
      {scenarios.length === 1 && (
        <div className="banner banner-info">
          <div className="banner-body">
            Only the baseline exists so far. Create a shock (for example an energy cost increase), then responses to it, to
            compare outcomes here.
          </div>
        </div>
      )}
      <section className="card" aria-labelledby="cmp-heading">
        <div className="card-pad row" style={{ justifyContent: 'space-between', paddingBottom: 10 }}>
          <h2 id="cmp-heading">Scenario comparison</h2>
          <span className="small muted">
            Monthly figures in {project.currency} · saved results calculated by Univer on the server · click a figure to
            inspect it
          </span>
        </div>
        <div className="table-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th scope="col">Scenario</th>
                {COLUMNS.map((c) => (
                  <th scope="col" key={c.key}>
                    {c.label}
                  </th>
                ))}
                <th scope="col">Profit change vs baseline</th>
                <th scope="col" style={{ textAlign: 'left' }}>
                  Changes and assumptions
                </th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => {
                const parent = parentOf(project, s);
                const changes = changedInputs(s.calculation.inputs, parent?.calculation.inputs);
                const profit = s.calculation.metrics.profit ?? null;
                const userAssumptions = s.assumptions.filter((a) => a.source === 'user');
                return (
                  <tr key={s.id}>
                    <th scope="row" style={{ fontWeight: 600 }}>
                      <div className="stack" style={{ gap: 3 }}>
                        <span>{s.name}</span>
                        <span className="row" style={{ gap: 4 }}>
                          <span className={`badge badge-kind-${s.kind}`}>{KIND_LABEL[s.kind]}</span>
                          {parent && <span className="tiny muted">from {parent.name}</span>}
                        </span>
                      </div>
                    </th>
                    {COLUMNS.map((c) => {
                      const v = s.calculation.metrics[c.key] ?? null;
                      const pressed = inspect?.source === 'saved' && inspect.scenarioId === s.id && inspect.key === c.key;
                      return (
                        <td key={c.key} className="num-cell">
                          <button
                            type="button"
                            aria-pressed={pressed}
                            onClick={() => onInspect({ key: c.key, source: 'saved', scenarioId: s.id })}
                            aria-label={`Inspect ${c.label} for ${s.name}`}
                            style={c.key === 'profit' && typeof v === 'number' && v < 0 ? { color: 'var(--bad)', fontWeight: 700 } : undefined}
                          >
                            {c.key === 'marginFraction' ? formatMargin(v) : formatMoney(v, project.currency)}
                          </button>
                          {c.key === 'profit' && (
                            <div className="tiny muted">{outcomeLabel(profit)}</div>
                          )}
                        </td>
                      );
                    })}
                    <td>{s.kind === 'baseline' ? <span className="muted">—</span> : <DeltaText value={changeAgainst(profit, baseProfit)} currency={project.currency} />}</td>
                    <td className="changes">
                      {changes.length === 0 && s.kind !== 'baseline' && <span>No input changes yet.</span>}
                      {s.kind === 'baseline' && <span>{project.demo ? 'Fictional demo figures.' : 'Your figures.'}</span>}
                      {changes.map((c) => (
                        <div key={c.key}>
                          {c.label}:{' '}
                          <span className="num">
                            {c.key === 'monthlyUnits' ? formatNumber(c.from) : formatMoney(c.from, project.currency)} →{' '}
                            {c.key === 'monthlyUnits' ? formatNumber(c.to) : formatMoney(c.to, project.currency)}
                          </span>
                        </div>
                      ))}
                      {userAssumptions
                        .filter((a) => changes.some((c) => c.key === a.inputKey) || a.inputKey === 'monthlyUnits')
                        .map((a) => (
                          <div key={a.inputKey} style={{ marginTop: 3, fontStyle: 'italic' }}>
                            {a.inputKey === 'monthlyUnits' && a.confirmed ? '✓ Sales confirmed: ' : ''}
                            {a.note}
                          </div>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Charts of saved, server-calculated results; rendered full width below the table. */
export function ComparisonCharts({ project }: { project: Project }) {
  const scenarios = orderScenarios(project);
  const baseProfit = baselineOf(project)?.calculation.metrics.profit ?? null;
  const rows: ChartRow[] = scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    revenue: s.calculation.metrics.revenue ?? null,
    totalCosts: s.calculation.metrics.totalCosts ?? null,
    profit: s.calculation.metrics.profit ?? null,
    profitChange: changeAgainst(s.calculation.metrics.profit, baseProfit),
  }));
  return (
    <div className="chart-grid">
      <ResultsBarChart rows={rows} currency={project.currency} />
      {rows.length > 1 ? (
        <ProfitChangeChart rows={rows.filter((r) => r.id !== project.baselineScenarioId)} currency={project.currency} />
      ) : (
        <div className="card chart-card">
          <h3>Profit change against baseline</h3>
          <p className="small muted">Appears once you add a shock or response.</p>
        </div>
      )}
    </div>
  );
}
