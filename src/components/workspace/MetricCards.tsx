'use client';
import type { ReactNode } from 'react';
import type { CalculationError } from '@/lib/contracts/project';
import { formatMargin, formatMoney, outcomeLabel } from '@/lib/format';
import { changeAgainst } from '@/lib/scenarios';
import { BAKERY_RESULTS, type BakeryResultKey } from '@/lib/templates/bakery';

const CARDS: { key: BakeryResultKey; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'totalCosts', label: 'Total costs' },
  { key: 'profit', label: 'Profit' },
  { key: 'marginFraction', label: 'Profit margin' },
];

export function DeltaText({ value, currency }: { value: number | null; currency: string }) {
  if (value === null) return <span className="muted">—</span>;
  const cls = value > 0 ? 'delta-pos' : value < 0 ? 'delta-neg' : 'delta-zero';
  const word = value > 0 ? 'higher' : value < 0 ? 'lower' : 'no change';
  return (
    <span className={cls}>
      {value > 0 ? '▲ ' : value < 0 ? '▼ ' : ''}
      {formatMoney(value, currency, { signed: true })} <span className="sr-only">({word})</span>
    </span>
  );
}

export function MetricCards({
  metrics,
  errors,
  currency,
  baselineProfit,
  isBaseline,
  activeKey,
  onInspect,
}: {
  metrics: Record<BakeryResultKey, number | null> | null;
  errors: CalculationError[];
  currency: string;
  baselineProfit: number | null;
  isBaseline: boolean;
  activeKey: BakeryResultKey | null;
  onInspect: (key: BakeryResultKey) => void;
}) {
  return (
    <div className="metrics" role="group" aria-label="Calculated results">
      {CARDS.map(({ key, label }) => {
        const cell = BAKERY_RESULTS.find((r) => r.key === key)!.cell;
        const error = errors.find((e) => e.cell === cell);
        const value = metrics ? metrics[key] : null;
        const isLoss = key === 'profit' && typeof value === 'number' && value < 0;
        let display: string;
        let sub: ReactNode = null;
        if (!metrics) display = '…';
        else if (error) {
          display = 'Formula error';
          sub = <span>{error.message}</span>;
        } else if (key === 'marginFraction') {
          display = formatMargin(value);
          if (value === null) sub = <span>Revenue is zero, so margin is not defined.</span>;
        } else {
          display = formatMoney(value, currency);
          if (key === 'profit') {
            const label2 = outcomeLabel(value);
            sub = (
              <>
                {label2 !== 'Profit' && <span className={`badge ${isLoss ? 'badge-bad' : 'badge-locked'}`}>{label2}</span>}
                {!isBaseline && (
                  <span>
                    vs baseline <DeltaText value={changeAgainst(value, baselineProfit)} currency={currency} />
                  </span>
                )}
              </>
            );
          }
        }
        return (
          <button
            key={key}
            type="button"
            className={`metric${isLoss ? ' loss' : ''}${error ? ' error' : ''}`}
            aria-pressed={activeKey === key}
            onClick={() => onInspect(key)}
            title={`How ${label.toLowerCase()} is calculated`}
          >
            <span className="m-label">{label}</span>
            <span className="m-value">{display}</span>
            <span className="m-sub">{sub}</span>
          </button>
        );
      })}
    </div>
  );
}
