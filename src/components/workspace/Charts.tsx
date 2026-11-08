'use client';
/**
 * SVG charts drawn from saved, server-calculated scenario metrics. Scales only
 * position marks; no business figures are computed here.
 */
import { useState } from 'react';
import { formatMoney } from '@/lib/format';

export interface ChartRow {
  id: string;
  name: string;
  revenue: number | null;
  totalCosts: number | null;
  profit: number | null;
  profitChange: number | null;
}

const SERIES = [
  { key: 'revenue', label: 'Revenue', color: 'var(--series-1)' },
  { key: 'totalCosts', label: 'Total costs', color: 'var(--series-2)' },
  { key: 'profit', label: 'Profit', color: 'var(--series-3)' },
] as const;

function niceExtent(values: number[]): [number, number] {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  if (min === 0 && max === 0) return [0, 1];
  const span = max - min;
  const step = 10 ** Math.floor(Math.log10(span / 4));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => span / s <= 5) ?? step * 10;
  return [Math.floor(min / nice) * nice, Math.ceil(max / nice) * nice];
}

function ticks([lo, hi]: [number, number], count = 5): number[] {
  const step = (hi - lo) / count;
  return Array.from({ length: count + 1 }, (_, i) => lo + i * step);
}

function compact(v: number, currency: string) {
  const abs = Math.abs(v);
  if (abs >= 10000) {
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v);
    } catch {
      /* fall through */
    }
  }
  return formatMoney(v, currency);
}

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

export function ResultsBarChart({ rows, currency }: { rows: ChartRow[]; currency: string }) {
  const [tip, setTip] = useState<Tip>(null);
  const values = rows.flatMap((r) => SERIES.map((s) => r[s.key]).filter((v): v is number => typeof v === 'number'));
  const extent = niceExtent(values);
  const W = 640;
  const H = 280;
  const m = { top: 12, right: 8, bottom: 46, left: 64 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const y = (v: number) => m.top + ih - ((v - extent[0]) / (extent[1] - extent[0])) * ih;
  const group = iw / Math.max(rows.length, 1);
  const barW = Math.min(26, (group - 18) / SERIES.length - 2);
  const zeroY = y(0);

  return (
    <div className="card chart-card">
      <h3>Revenue, costs and profit</h3>
      <div className="legend" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart of revenue, total costs and profit for each scenario. The same figures are in the table above." onMouseLeave={() => setTip(null)}>
        <g className="axis">
          {ticks(extent).map((t) => (
            <g key={t}>
              <line className="grid-line" x1={m.left} x2={W - m.right} y1={y(t)} y2={y(t)} />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {compact(t, currency)}
              </text>
            </g>
          ))}
        </g>
        {rows.map((r, gi) => {
          const gx = m.left + gi * group + (group - (barW + 2) * SERIES.length) / 2;
          return (
            <g key={r.id}>
              {SERIES.map((s, si) => {
                const v = r[s.key];
                if (typeof v !== 'number') return null;
                const x = gx + si * (barW + 2);
                const top = Math.min(y(v), zeroY);
                const h = Math.max(Math.abs(zeroY - y(v)), 1);
                const show = () => setTip({ x: ((x + barW / 2) / W) * 100, y: (top / H) * 100, title: r.name, lines: [`${s.label}: ${formatMoney(v, currency)}`] });
                return (
                  <g key={s.key}>
                    <rect x={x} y={top} width={barW} height={h} rx={3} fill={s.color} />
                    <rect x={x - 1} y={m.top} width={barW + 2} height={ih} fill="transparent" onMouseEnter={show} onFocus={show} tabIndex={-1} />
                  </g>
                );
              })}
              <text className="cat-label" x={m.left + gi * group + group / 2} y={H - m.bottom + 18} textAnchor="middle">
                {r.name.length > 18 ? `${r.name.slice(0, 17)}…` : r.name}
              </text>
            </g>
          );
        })}
        <line className="zero-line" x1={m.left} x2={W - m.right} y1={zeroY} y2={zeroY} />
      </svg>
      {tip && (
        <div className="chart-tooltip" style={{ left: `${tip.x}%`, top: `${tip.y}%` }}>
          <strong>{tip.title}</strong>
          {tip.lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

export function ProfitChangeChart({ rows, currency }: { rows: ChartRow[]; currency: string }) {
  const [tip, setTip] = useState<Tip>(null);
  const data = rows.filter((r) => typeof r.profitChange === 'number');
  const values = data.map((r) => r.profitChange as number);
  const extent = niceExtent(values);
  const W = 520;
  const rowH = 40;
  const m = { top: 8, right: 80, bottom: 26, left: 150 };
  const H = m.top + m.bottom + Math.max(data.length, 1) * rowH;
  const iw = W - m.left - m.right;
  const pad = 14;
  const x = (v: number) => m.left + pad + ((v - extent[0]) / (extent[1] - extent[0])) * (iw - pad);
  const zeroX = x(0);
  return (
    <div className="card chart-card">
      <h3>Profit change against baseline</h3>
      <div className="legend" aria-hidden>
        <span>
          <i style={{ background: 'var(--pos)' }} /> Higher than baseline
        </span>
        <span>
          <i style={{ background: 'var(--neg)' }} /> Lower than baseline
        </span>
      </div>
      <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Profit change against the baseline for each scenario. The same figures are in the table above." onMouseLeave={() => setTip(null)}>
        <g className="axis">
          {ticks(extent, 4).map((t) => (
            <g key={t}>
              <line className="grid-line" x1={x(t)} x2={x(t)} y1={m.top} y2={H - m.bottom} />
              <text x={x(t)} y={H - m.bottom + 14} textAnchor="middle">
                {compact(t, currency)}
              </text>
            </g>
          ))}
        </g>
        {data.map((r, i) => {
          const v = r.profitChange as number;
          const cy = m.top + i * rowH + rowH / 2;
          const x0 = Math.min(zeroX, x(v));
          const w = Math.max(Math.abs(x(v) - zeroX), v === 0 ? 0 : 1);
          const show = () =>
            setTip({ x: (Math.max(x(v), zeroX) / W) * 100, y: ((cy - 8) / H) * 100, title: r.name, lines: [`Profit change: ${formatMoney(v, currency, { signed: true })}`] });
          return (
            <g key={r.id} onMouseEnter={show}>
              <rect x={0} y={cy - rowH / 2} width={W} height={rowH} fill="transparent" />
              <text className="cat-label" x={m.left - 8} y={cy} dy="0.32em" textAnchor="end">
                {r.name.length > 18 ? `${r.name.slice(0, 17)}…` : r.name}
              </text>
              {v !== 0 && <rect x={x0} y={cy - 9} width={w} height={18} rx={3} fill={v > 0 ? 'var(--pos)' : 'var(--neg)'} />}
              <text className="bar-label" x={Math.max(x(v), zeroX) + 6} y={cy} dy="0.32em" textAnchor="start">
                {v === 0 ? 'No change' : formatMoney(v, currency, { signed: true })}
              </text>
            </g>
          );
        })}
        <line className="zero-line" x1={zeroX} x2={zeroX} y1={m.top} y2={H - m.bottom} />
      </svg>
      {tip && (
        <div className="chart-tooltip" style={{ left: `${tip.x}%`, top: `${tip.y}%` }}>
          <strong>{tip.title}</strong>
          {tip.lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
