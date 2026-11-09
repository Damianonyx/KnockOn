'use client';
/**
 * SVG charts drawn from saved, server-calculated scenario metrics. Scales only
 * position marks; no business figures are computed here.
 */
import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@/lib/format';

export interface ChartRow {
  id: string;
  name: string;
  revenue: number | null;
  totalCosts: number | null;
  profit: number | null;
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

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

export function ResultsBarChart({ rows, currency }: { rows: ChartRow[]; currency: string }) {
  const [tip, setTip] = useState<Tip>(null);
  // Draw at the real width, so the text stays readable on a phone instead of shrinking with the chart.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setW(Math.max(260, Math.round(el.clientWidth)) || 640);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const values = rows.flatMap((r) => SERIES.map((s) => r[s.key]).filter((v): v is number => typeof v === 'number'));
  const extent = niceExtent(values);
  const H = W < 480 ? 230 : 280;
  const m = { top: 12, right: 8, bottom: 46, left: W < 480 ? 54 : 64 };
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
      <div ref={box} style={{ position: 'relative' }}>
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
                {truncate(r.name, Math.max(6, Math.floor(group / 7.5)))}
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
