'use client';
import { useEffect, useState } from 'react';
import type { Assumption } from '@/lib/contracts/project';
import { formatMoney, formatNumber, parseNumberInput } from '@/lib/format';
import type { InputValues, PriceConfirmation } from '@/lib/scenarios';
import { BAKERY_INPUTS, type BakeryInputKey } from '@/lib/templates/bakery';
import type { LiveState } from './types';
import { isMoneyInput } from './types';

function InputControl({
  inputKey,
  label,
  cell,
  value,
  raw,
  parentValue,
  readOnly,
  serverError,
  localIssue,
  currency,
  onCommit,
}: {
  inputKey: BakeryInputKey;
  label: string;
  cell: string;
  value: number | null;
  raw: unknown;
  parentValue: number | null | undefined;
  readOnly: boolean;
  serverError?: string;
  localIssue?: string;
  currency: string;
  onCommit: (key: BakeryInputKey, value: number) => Promise<void>;
}) {
  const external = value !== null ? String(value) : raw === undefined || raw === null ? '' : String(raw);
  const [text, setText] = useState(external);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follow the spreadsheet when the cell is edited there (not while typing here).
  useEffect(() => {
    if (!focused) {
      setText(external);
      setError(null);
    }
  }, [external, focused]);

  async function commit() {
    if (readOnly) return;
    if (text === external) return;
    const parsed = parseNumberInput(text);
    if (parsed === null) {
      setError(text.trim() === '' ? 'Enter a number. Zero is valid; blank is not.' : 'Enter a number, for example 1250 or 4.5.');
      return;
    }
    if (parsed < 0) {
      setError('Must be zero or more.');
      return;
    }
    setError(null);
    try {
      await onCommit(inputKey, parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the cell.');
    }
  }

  const changed = parentValue !== undefined && value !== (parentValue ?? null);
  const shownError = error ?? localIssue ?? serverError;
  const id = `input-${inputKey}`;
  return (
    <div className={`input-row${changed ? ' is-changed' : ''}`}>
      <label htmlFor={id}>
        <span>{label}</span>
        <span className="cellref">{cell}</span>
        {changed && (
          <span className="changed">
            Changed from {isMoneyInput(inputKey) ? formatMoney(parentValue ?? null, currency) : formatNumber(parentValue ?? null)}
          </span>
        )}
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={text}
        disabled={readOnly}
        aria-invalid={Boolean(shownError)}
        aria-describedby={shownError ? `${id}-err` : undefined}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setFocused(false);
          void commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          } else if (e.key === 'Escape') {
            setText(external);
            setError(null);
          }
        }}
      />
      {shownError && (
        <span className="error-text" id={`${id}-err`} role="alert">
          {shownError}
        </span>
      )}
    </div>
  );
}

function PriceConfirmationBox({
  state,
  currency,
  readOnly,
  highlight,
  onConfirm,
}: {
  state: Extract<PriceConfirmation, { required: true }>;
  currency: string;
  readOnly: boolean;
  highlight: boolean;
  onConfirm: (monthlyUnits: number, note: string) => Promise<void>;
}) {
  const [units, setUnits] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(state.status !== 'confirmed');

  useEffect(() => {
    setEditing(state.status !== 'confirmed');
  }, [state.status]);

  if (state.status === 'confirmed' && !editing) {
    return (
      <div className="confirm-box ok" role="status">
        <strong>✓ Expected sales confirmed</strong>
        <span>
          You expect to sell <strong>{formatNumber(state.units)}</strong> units a month at{' '}
          <strong>{formatMoney(state.price, currency)}</strong> (was {formatMoney(state.parentPrice, currency)}).
        </span>
        {!readOnly && (
          <div>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
              Change expected sales
            </button>
          </div>
        )}
      </div>
    );
  }

  async function submit() {
    const parsed = parseNumberInput(units);
    if (parsed === null || parsed < 0) {
      setError('Enter the number of units you expect to sell each month (zero or more).');
      return;
    }
    setError(null);
    try {
      await onConfirm(parsed, note);
      setUnits('');
      setNote('');
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply the expected sales.');
    }
  }

  return (
    <div className="confirm-box" role="group" aria-labelledby="price-confirm-title" style={highlight ? { outline: '2px solid var(--bad)' } : undefined}>
      <strong id="price-confirm-title">Expected monthly sales needed</strong>
      <span>
        The price changed from {formatMoney(state.parentPrice, currency)} to {formatMoney(state.price, currency)}.
        KnockOn does not guess how customers respond to a price change. Enter the monthly sales you expect at the new
        price — even if you expect no change.
        {state.status === 'stale' && <strong> The price or units changed after your last confirmation; confirm again.</strong>}
      </span>
      <span className="tiny muted">Currently in the sheet (B2): {formatNumber(state.units)} units.</span>
      <div className="field">
        <label htmlFor="confirm-units">Expected units sold per month at {formatMoney(state.price, currency)}</label>
        <input
          id="confirm-units"
          inputMode="decimal"
          value={units}
          onChange={(e) => setUnits(e.target.value)}
          disabled={readOnly}
          aria-invalid={Boolean(error)}
          placeholder="e.g. 950"
        />
      </div>
      <div className="field">
        <label htmlFor="confirm-note">Why (optional)</label>
        <input id="confirm-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} disabled={readOnly} placeholder="e.g. A few regulars may buy less" />
      </div>
      {error && <span className="error-text" style={{ color: 'var(--bad)', fontWeight: 600 }}>{error}</span>}
      <div className="row">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => void submit()} disabled={readOnly}>
          Confirm expected sales
        </button>
        {state.status === 'confirmed' && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export function InputsPanel({
  live,
  parentInputs,
  readOnly,
  currency,
  priceState,
  assumptions,
  serverFields,
  onCommit,
  onConfirmUnits,
}: {
  live: LiveState | null;
  parentInputs: InputValues | undefined;
  readOnly: boolean;
  currency: string;
  priceState: PriceConfirmation;
  assumptions: Assumption[];
  serverFields: Record<string, string>;
  onCommit: (key: BakeryInputKey, value: number) => Promise<void>;
  onConfirmUnits: (monthlyUnits: number, note: string) => Promise<void>;
}) {
  const issueFor = (cell: string) => live?.issues.find((i) => i.field === `workbook.${cell}`)?.message;
  // Demo figures are already labelled in the header; only the user's own assumptions are listed.
  const own = assumptions.filter((a) => a.source === 'user' && a.note);
  return (
    <section className="card panel" aria-labelledby="inputs-heading">
      <div className="panel-head">
        <h3 id="inputs-heading">Inputs</h3>
      </div>
      <div className="panel-body">
        {priceState.required && (
          <PriceConfirmationBox
            state={priceState}
            currency={currency}
            readOnly={readOnly}
            highlight={Boolean(serverFields['assumptions.monthlyUnits'])}
            onConfirm={onConfirmUnits}
          />
        )}
        {BAKERY_INPUTS.map((m) => (
          <InputControl
            key={m.key}
            inputKey={m.key as BakeryInputKey}
            label={m.label}
            cell={m.cell}
            value={live ? live.inputs[m.key as BakeryInputKey] : null}
            raw={live ? live.raw[m.key as BakeryInputKey] : undefined}
            parentValue={parentInputs ? (parentInputs[m.key as BakeryInputKey] ?? null) : undefined}
            readOnly={readOnly || !live}
            serverError={serverFields[`workbook.${m.cell}`]}
            localIssue={issueFor(m.cell)}
            currency={currency}
            onCommit={onCommit}
          />
        ))}
        {own.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <h3 style={{ fontSize: '0.9rem' }}>Your assumptions</h3>
            <ul className="assumption-list">
              {own.map((a) => (
                <li key={a.inputKey}>{a.note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
