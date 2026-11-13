'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/lib/api/client';
import { analysisRequestSchema, BREAK_EVEN_FORMULAS, sensitivityFormulas, type ProjectAnalysis, type ScenarioAnalysis, type SensitivityPoint } from '@/lib/contracts/analysis';
import type { Project } from '@/lib/contracts/project';
import { BAKERY_INPUTS } from '@/lib/templates/bakery';
import { formatMoney, formatNumber, parseNumberInput } from '@/lib/format';
import styles from './AnalysisView.module.css';
import { AnalysisExportTools } from './AnalysisExportTools';

function threshold(scenario: ScenarioAnalysis) {
  switch (scenario.breakEvenStatus) {
    case 'unreachable': return 'Costs cannot be covered';
    case 'any-volume': return 'Break-even at every volume';
    case 'zero-sales-only': return 'Break-even only at 0 sales';
    default: return `${formatNumber(scenario.breakEvenUnits, 0)} units / month`;
  }
}

function thresholdNote(scenario: ScenarioAnalysis) {
  switch (scenario.breakEvenStatus) {
    case 'unreachable': return scenario.contributionPerUnit < 0
      ? 'Each sale costs more in ingredients than it earns, so extra sales increase the loss.'
      : 'Price equals ingredient cost, so no sales volume covers the monthly overheads.';
    case 'any-volume': return 'Price equals ingredient cost and monthly overheads are zero. Profit stays zero.';
    case 'zero-sales-only': return 'Monthly overheads are zero, but each sale loses money.';
    default: return scenario.breakEvenUnits === 0
      ? 'Monthly overheads are zero, so zero sales covers costs and every sale adds profit.'
      : 'Minimum whole units to cover costs, rounded up, so profit at this volume can be slightly above zero. Not a sales forecast.';
  }
}

function SensitivityChart({ scenario, baseline, currency, onInspect }: {
  scenario: ScenarioAnalysis; baseline?: ScenarioAnalysis; currency: string; onInspect: (point: SensitivityPoint) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(680);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const fit = () => setWidth(Math.max(240, element.clientWidth));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const comparison = baseline && baseline.scenarioId !== scenario.scenarioId ? baseline : undefined;
  const values = [...scenario.points, ...(comparison?.points ?? [])].map((p) => p.profit);
  // Chart coordinates only: all plotted business figures come from Univer.
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const first = scenario.points[0].units;
  const last = scenario.points.at(-1)!.units;
  const left = width < 420 ? 74 : 88;
  const right = width - 24;
  const x = (units: number) => left + (units - first) / (last - first) * (right - left);
  const y = (profit: number) => 24 + (max - profit) / span * 180;
  const path = (s: ScenarioAnalysis) => s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.units)},${y(p.profit)}`).join(' ');
  // Position only: the threshold itself is Univer's B19 result.
  const marker = scenario.breakEvenStatus === 'attainable' && scenario.breakEvenUnits !== null && scenario.breakEvenUnits >= first && scenario.breakEvenUnits <= last
    ? scenario.breakEvenUnits : null;
  const tick = (n: number) => new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  return (
    <div ref={host}>
      <p className="small muted">Monthly profit ({currency}) · select a point to inspect it</p>
      <svg viewBox={`0 0 ${width} 260`} className={styles.chart} role="group" aria-label={`Profit across sales volumes for ${scenario.name}. Exact values are in the table below.`}>
        {[...new Set([min, 0, max])].map((value) => (
          <g key={value}>
            <line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="var(--border-strong)" strokeDasharray={value === 0 ? undefined : '3 4'} />
            <text x={left - 8} y={y(value)} dy="0.35em" textAnchor="end">{tick(value)}</text>
          </g>
        ))}
        {marker !== null && (
          <g>
            <line x1={x(marker)} x2={x(marker)} y1={24} y2={204} stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="2 4" />
            <text x={x(marker)} y={16} textAnchor={x(marker) > (left + right) / 2 ? 'end' : 'start'} className={styles.marker}>Covers costs from {formatNumber(marker)} units</text>
          </g>
        )}
        {comparison && <path d={path(comparison)} fill="none" stroke="var(--text-3)" strokeWidth="2" strokeDasharray="6 4" />}
        <path d={path(scenario)} fill="none" stroke="var(--brand)" strokeWidth="3" />
        {scenario.points.map((point) => (
          <g key={point.row}>
            <circle cx={x(point.units)} cy={y(point.profit)} r="4" fill="var(--accent)" />
            <circle cx={x(point.units)} cy={y(point.profit)} r="12" fill="transparent" tabIndex={0} role="button"
              aria-label={`Inspect ${formatNumber(point.units)} units: profit ${formatMoney(point.profit, currency)}`}
              onClick={() => onInspect(point)} onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onInspect(point); }
              }}>
              <title>{formatNumber(point.units)} units: {formatMoney(point.profit, currency)} profit</title>
            </circle>
          </g>
        ))}
        <text x={left} y="229" textAnchor="start">{tick(first)}</text>
        <text x={right} y="229" textAnchor="end">{tick(last)}</text>
        <text x={(left + right) / 2} y="253" textAnchor="middle">Units sold per month</text>
      </svg>
      <p className="small"><span className={styles.solidKey} />{scenario.name}{comparison && <><span className={styles.dashedKey} />Baseline</>}</p>
    </div>
  );
}

export function AnalysisView({ project, activeScenarioId, dirty, excelExportAvailable }: { project: Project; activeScenarioId: string; dirty: boolean; excelExportAvailable: boolean }) {
  const [minUnits, setMinUnits] = useState('');
  const [maxUnits, setMaxUnits] = useState('');
  const [data, setData] = useState<ProjectAnalysis | null>(null);
  const [selectedId, setSelectedId] = useState(activeScenarioId);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState('');
  const formulaPanel = useRef<HTMLDetailsElement>(null);
  const low = parseNumberInput(minUnits);
  const high = parseNumberInput(maxUnits);
  const current = data && data.projectRevision === project.revision && data.minUnits === low && data.maxUnits === high;
  const selected = current ? data.scenarios.find((s) => s.scenarioId === selectedId) ?? data.scenarios[0] : undefined;
  const point = selected?.points.find((p) => p.row === selectedRow);

  async function run(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    const parsed = analysisRequestSchema.safeParse({ expectedRevision: project.revision, minUnits: low, maxUnits: high });
    if (!parsed.success) {
      setProblem('Enter whole-number monthly sales from 0 to 1,000,000,000. Maximum must be greater than minimum.');
      return;
    }
    setLoading(true); setProblem(''); setSelectedRow(null); setData(null);
    try {
      const result = await api.analyse(project.id, parsed.data);
      setData(result); setSelectedId(activeScenarioId);
    } catch (error) { setProblem(errorMessage(error)); }
    finally { setLoading(false); }
  }

  function inspect(next?: SensitivityPoint) {
    setSelectedRow(next?.row ?? null);
    if (formulaPanel.current) {
      formulaPanel.current.open = true;
      formulaPanel.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      formulaPanel.current.querySelector('summary')?.focus();
    }
  }

  return (
    <section id="analysis" className={`stack ${styles.section}`} aria-labelledby="analysis-heading">
      <div className="stack" style={{ gap: 6 }}>
        <h2 id="analysis-heading">Break-even &amp; sales sensitivity</h2>
        <p className="small muted">How many sales cover your costs? What happens to profit if sales change? Choose a range to explore your saved scenarios.</p>
      </div>
      <div className={`card stack ${styles.body}`}>
        <form onSubmit={(event) => void run(event)} className={styles.form}>
          <div className="field"><label htmlFor="analysis-min">Minimum monthly sales (units)</label>
            <input id="analysis-min" type="text" inputMode="numeric" placeholder="e.g. 500" value={minUnits} onChange={(e) => setMinUnits(e.target.value)} required /></div>
          <div className="field"><label htmlFor="analysis-max">Maximum monthly sales (units)</label>
            <input id="analysis-max" type="text" inputMode="numeric" placeholder="e.g. 1,500" value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)} required /></div>
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Calculating…' : 'Run analysis'}</button>
        </form>
        <p className="small muted">Hypothetical sales, not a demand forecast. Price, ingredient cost per unit and monthly overheads stay fixed within each scenario. Production capacity and energy use that changes with volume are not modelled. Your saved sales estimates and baseline stay unchanged.</p>
        {project.demo && <p className="small muted">This project started with fictional demo figures for learning.</p>}
        {dirty && <p className="small" role="status">Unsaved edits are excluded. Save to include them in the analysis.</p>}
        {problem && <p className="error-text" role="alert">{problem}</p>}
        {data && !current && <p role="status" className="small">The saved project or sales range changed. Run analysis again to see current results.</p>}
        {current && selected && (
          <>
            <p className="small muted">Saved revision {data.projectRevision} · {formatNumber(data.minUnits)}–{formatNumber(data.maxUnits)} units per month · calculated by Univer</p>
            <AnalysisExportTools key={`${data.projectRevision}:${data.minUnits}:${data.maxUnits}:${selected.scenarioId}`}
              projectId={project.id} excelExportAvailable={excelExportAvailable}
              request={{ expectedRevision: data.projectRevision, minUnits: data.minUnits, maxUnits: data.maxUnits, scenarioId: selected.scenarioId }} />
            <div className={styles.thresholds} role="group" aria-label="Break-even by scenario">
              {data.scenarios.map((scenario) => (
                <button key={scenario.scenarioId} type="button" className={styles.threshold} aria-pressed={selected.scenarioId === scenario.scenarioId}
                  onClick={() => { setSelectedId(scenario.scenarioId); setSelectedRow(null); }}>
                  <span>{scenario.name}</span><strong>{threshold(scenario)}</strong><span className="small muted">{thresholdNote(scenario)}</span>
                </button>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>Sales sensitivity · {selected.name}</h3>
              <button type="button" className="btn btn-sm" onClick={() => inspect()}>Inspect break-even</button>
            </div>
            <SensitivityChart scenario={selected} baseline={data.scenarios.find((s) => s.kind === 'baseline')} currency={project.currency} onInspect={inspect} />
            <div className="table-wrap">
              <table className={styles.table}>
                <caption className="sr-only">Hypothetical sales and calculated results for {selected.name}</caption>
                <thead><tr><th scope="col">Units / month</th><th scope="col">Revenue</th><th scope="col">Total costs</th><th scope="col">Profit</th></tr></thead>
                <tbody>{selected.points.map((p) => <tr key={p.row}>
                  <th scope="row">{formatNumber(p.units)}</th><td>{formatMoney(p.revenue, project.currency)}</td><td>{formatMoney(p.totalCosts, project.currency)}</td>
                  <td><button type="button" className={styles.result} aria-label={`Inspect profit at ${formatNumber(p.units)} units`} onClick={() => inspect(p)}>{formatMoney(p.profit, project.currency)}</button></td>
                </tr>)}</tbody>
              </table>
            </div>
            <details ref={formulaPanel} className={styles.formulas}>
              <summary>Inspect formulas and inputs</summary>
              <div className="stack" style={{ gap: 12, marginTop: 12 }}>
                <p className="small muted">These cell references belong to the separate analysis for {selected.name}. The saved worksheet stays unchanged.</p>
                <p>Monthly overheads: <strong>{formatMoney(selected.fixedCosts, project.currency)}</strong><code>B13 {BREAK_EVEN_FORMULAS.B13}</code></p>
                <p>Contribution per unit: <strong>{formatMoney(selected.contributionPerUnit, project.currency)}</strong><code>B18 {BREAK_EVEN_FORMULAS.B18}</code></p>
                <p>Break-even: <strong>{threshold(selected)}</strong><code>B19 {BREAK_EVEN_FORMULAS.B19}</code></p>
                <p className="small">With a positive contribution, divide monthly overheads by contribution per unit and round up to whole units. If overheads are zero, zero sales covers costs; a zero or negative contribution needs the special cases shown above. The two ROUND steps stop tiny decimal rounding errors from adding a unit.</p>
                {point && <div className="stack" style={{ gap: 8 }}>
                  <h3>{formatNumber(point.units)} hypothetical units per month</h3>
                  <p>Analysis input A{point.row}: {formatNumber(point.units)} units</p>
                  <p>Revenue: {formatMoney(point.revenue, project.currency)}<code>B{point.row} {sensitivityFormulas(point.row).revenue}</code></p>
                  <p>Total costs: {formatMoney(point.totalCosts, project.currency)}<code>C{point.row} {sensitivityFormulas(point.row).totalCosts}</code></p>
                  <p>Profit: {formatMoney(point.profit, project.currency)}<code>D{point.row} {sensitivityFormulas(point.row).profit}</code></p>
                </div>}
                <dl className={styles.inputs}>{BAKERY_INPUTS.map((input) => <div key={input.key}>
                  <dt>{input.cell} · {input.label}</dt><dd>{input.key === 'monthlyUnits' ? `${formatNumber(selected.inputs.monthlyUnits)} units (saved estimate)` : formatMoney(selected.inputs[input.key as keyof typeof selected.inputs], project.currency)}</dd>
                </div>)}</dl>
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
