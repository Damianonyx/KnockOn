'use client';
/**
 * Comparison of every scenario, on the same page as the model (no separate
 * mode): one table and one chart, both from saved, server-calculated results.
 * Clicking a figure opens its formula in the inspect panel.
 */
import type { Project } from '@/lib/contracts/project';
import { formatMargin, formatMoney, formatNumber } from '@/lib/format';
import { baselineOf, changeAgainst, changedInputs, orderScenarios, parentOf } from '@/lib/scenarios';
import type { BakeryResultKey } from '@/lib/templates/bakery';
import { ResultsBarChart, type ChartRow } from './Charts';
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
  dirty,
  onInspect,
}: {
  project: Project;
  inspect: InspectTarget | null;
  dirty: boolean;
  onInspect: (target: InspectTarget) => void;
}) {
  const scenarios = orderScenarios(project);
  const baseProfit = baselineOf(project)?.calculation.metrics.profit ?? null;
  const rows: ChartRow[] = scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    revenue: s.calculation.metrics.revenue ?? null,
    totalCosts: s.calculation.metrics.totalCosts ?? null,
    profit: s.calculation.metrics.profit ?? null,
  }));
  const money = (key: string, v: number | null) => (key === 'monthlyUnits' ? formatNumber(v) : formatMoney(v, project.currency));

  return (
    <section id="compare" className="stack compare-section" style={{ gap: 14 }} aria-labelledby="cmp-heading">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="cmp-heading">Compare</h2>
        {dirty && <span className="small muted">Saved results only. Save to include your edits.</span>}
      </div>
      {scenarios.length === 1 ? (
        <p className="small muted">Add a shock to compare it with the baseline.</p>
      ) : (
        <>
          <div className="card table-wrap">
            <table className="compare">
              <thead>
                <tr>
                  <th scope="col">Scenario</th>
                  {COLUMNS.map((c) => (
                    <th scope="col" key={c.key}>
                      {c.label}
                    </th>
                  ))}
                  <th scope="col">vs baseline</th>
                  <th scope="col" style={{ textAlign: 'left' }}>
                    What changed
                  </th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => {
                  const parent = parentOf(project, s);
                  const changes = changedInputs(s.calculation.inputs, parent?.calculation.inputs);
                  const profit = s.calculation.metrics.profit ?? null;
                  const sales = s.assumptions.find((a) => a.inputKey === 'monthlyUnits' && a.confirmed && a.source === 'user');
                  return (
                    <tr key={s.id}>
                      <th scope="row" style={{ fontWeight: 600, paddingLeft: s.kind === 'response' ? 26 : s.kind === 'shock' ? 18 : 10 }}>
                        {s.name}
                      </th>
                      {COLUMNS.map((c) => {
                        const v = s.calculation.metrics[c.key] ?? null;
                        const pressed = inspect?.source === 'saved' && inspect.scenarioId === s.id && inspect.key === c.key;
                        const loss = c.key === 'profit' && typeof v === 'number' && v < 0;
                        return (
                          <td key={c.key} className="num-cell">
                            <button
                              type="button"
                              aria-pressed={pressed}
                              onClick={() => onInspect({ key: c.key, source: 'saved', scenarioId: s.id })}
                              aria-label={`Inspect ${c.label} for ${s.name}`}
                              style={loss ? { color: 'var(--bad)', fontWeight: 700 } : undefined}
                            >
                              {c.key === 'marginFraction' ? formatMargin(v) : formatMoney(v, project.currency)}
                            </button>
                            {loss && <div className="tiny" style={{ color: 'var(--bad)' }}>Loss</div>}
                          </td>
                        );
                      })}
                      <td>{s.kind === 'baseline' ? <span className="muted">—</span> : <DeltaText value={changeAgainst(profit, baseProfit)} currency={project.currency} />}</td>
                      <td className="changes">
                        {s.kind === 'baseline' && <span>{project.demo ? 'Fictional demo figures' : 'Your figures'}</span>}
                        {changes.map((c) => (
                          <div key={c.key}>
                            {c.label}: <span className="num">{money(c.key, c.from)} → {money(c.key, c.to)}</span>
                          </div>
                        ))}
                        {sales && changes.some((c) => c.key === 'unitPrice') && <div className="muted">Sales are your estimate</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ResultsBarChart rows={rows} currency={project.currency} />
        </>
      )}
    </section>
  );
}
