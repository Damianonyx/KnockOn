'use client';
import { useMemo, useState } from 'react';
import type { Assumption, Project, Scenario } from '@/lib/contracts/project';
import { nameSchema } from '@/lib/contracts/project';
import { formatMoney, formatNumber, parseNumberInput } from '@/lib/format';
import { BAKERY_INPUTS, type BakeryInputKey } from '@/lib/templates/bakery';
import { Dialog } from '@/components/ui/Dialog';

export interface ForkSpec {
  kind: 'shock' | 'response';
  sourceId: string;
  name: string;
  changes: Partial<Record<BakeryInputKey, number>>;
  /** Assumptions to add or replace on the new scenario. */
  assumptions: Assumption[];
}

type Preset = {
  id: string;
  title: string;
  blurb: string;
  defaultName: string;
  fields: { key: BakeryInputKey; label: string }[];
};

const SHOCKS: Preset[] = [
  {
    id: 'energy',
    title: 'Energy or fuel cost increase',
    blurb: 'Raise the monthly energy expense.',
    defaultName: 'Energy cost increase',
    fields: [{ key: 'monthlyEnergy', label: 'New monthly energy expense' }],
  },
  {
    id: 'supplier-price',
    title: 'Supplier price increase',
    blurb: 'Raise the ingredient cost per unit.',
    defaultName: 'Supplier price increase',
    fields: [{ key: 'ingredientCostPerUnit', label: 'New ingredient cost per unit' }],
  },
  {
    id: 'sales-decline',
    title: 'Sales decline',
    blurb: 'Lower the units sold per month. The price stays the same.',
    defaultName: 'Sales decline',
    fields: [{ key: 'monthlyUnits', label: 'New units sold per month' }],
  },
  { id: 'custom', title: 'Custom shock', blurb: 'Copy the baseline and edit any inputs yourself.', defaultName: 'Custom shock', fields: [] },
];

const RESPONSES: Preset[] = [
  {
    id: 'price',
    title: 'Change the price',
    blurb: 'Set a new price and enter the monthly sales you expect at that price.',
    defaultName: 'Price change',
    fields: [
      { key: 'unitPrice', label: 'New price per unit' },
      { key: 'monthlyUnits', label: 'Expected units sold per month at the new price' },
    ],
  },
  {
    id: 'supplier-switch',
    title: 'Switch supplier',
    blurb: 'A new ingredient cost per unit, plus a monthly delivery cost.',
    defaultName: 'Switch supplier',
    fields: [
      { key: 'ingredientCostPerUnit', label: 'New ingredient cost per unit' },
      { key: 'monthlyDelivery', label: 'Monthly delivery cost' },
    ],
  },
  { id: 'custom', title: 'Custom response', blurb: 'Copy the shock and edit any inputs yourself.', defaultName: 'Custom response', fields: [] },
];

function unitHint(key: BakeryInputKey, currency: string) {
  if (key === 'monthlyUnits') return 'units';
  return currency;
}

export function ForkDialog({
  project,
  kind,
  source,
  onCancel,
  onSubmit,
}: {
  project: Project;
  kind: 'shock' | 'response';
  source: Scenario;
  onCancel: () => void;
  onSubmit: (spec: ForkSpec) => Promise<void>;
}) {
  const presets = kind === 'shock' ? SHOCKS : RESPONSES;
  const [presetId, setPresetId] = useState(presets[0].id);
  const preset = presets.find((p) => p.id === presetId)!;
  const [name, setName] = useState(preset.defaultName);
  const [nameTouched, setNameTouched] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sourceInputs = source.calculation.inputs;
  const currency = project.currency;
  const freezesBaseline = kind === 'shock' && !project.baselineFrozen;

  const sourceValue = (key: BakeryInputKey) => sourceInputs[key];
  const fmt = (key: BakeryInputKey, v: number | undefined) =>
    key === 'monthlyUnits' ? `${formatNumber(v ?? null)} units` : formatMoney(v ?? null, currency);

  const title = kind === 'shock' ? 'New shock' : 'New response';
  const description = useMemo(
    () =>
      kind === 'shock'
        ? 'A shock copies the saved baseline and changes something outside your control.'
        : `A response copies the saved shock “${source.name}” and changes how the bakery reacts.`,
    [kind, source.name],
  );

  function choose(id: string) {
    setPresetId(id);
    const next = presets.find((p) => p.id === id)!;
    if (!nameTouched) setName(next.defaultName);
    setValues({});
    setErrors({});
  }

  async function submit() {
    const errs: Record<string, string> = {};
    const nameParsed = nameSchema.safeParse(name);
    if (!nameParsed.success) errs.name = nameParsed.error.issues[0]?.message ?? 'Enter a name.';
    const changes: Partial<Record<BakeryInputKey, number>> = {};
    for (const f of preset.fields) {
      const parsed = parseNumberInput(values[f.key] ?? '');
      if (parsed === null) errs[f.key] = f.key === 'monthlyUnits' && preset.id === 'price' ? 'Enter the sales you expect. Knock-On will not estimate it.' : 'Enter a number.';
      else if (parsed < 0) errs[f.key] = 'Must be zero or more.';
      else changes[f.key] = parsed;
    }
    if (preset.id === 'price' && changes.unitPrice !== undefined && changes.unitPrice === sourceValue('unitPrice')) {
      errs.unitPrice = 'That is the current price. Enter a different price, or use a custom response.';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const assumptions: Assumption[] = [];
    const extra = note.trim();
    for (const f of preset.fields) {
      const value = changes[f.key]!;
      if (preset.id === 'price' && f.key === 'monthlyUnits') {
        assumptions.push({
          inputKey: 'monthlyUnits',
          note:
            extra ||
            `Expected monthly sales at the new price of ${changes.unitPrice}: ${value} units (was ${sourceValue('monthlyUnits')}). Entered by the user.`,
          source: 'user',
          confirmed: true,
          confirmedFor: { unitPrice: changes.unitPrice!, monthlyUnits: value },
        });
        continue;
      }
      const label = BAKERY_INPUTS.find((m) => m.key === f.key)?.label ?? f.key;
      assumptions.push({
        inputKey: f.key,
        note: `${preset.title}: ${label.toLowerCase()} ${sourceValue(f.key)} → ${value}.${extra && preset.id !== 'price' ? ` ${extra}` : ''}`,
        source: 'user',
        confirmed: true,
      });
    }

    setBusy(true);
    setSubmitError(null);
    try {
      await onSubmit({ kind, sourceId: source.id, name: nameParsed.data!, changes, assumptions });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not create the scenario.');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={title}
      description={description}
      onClose={busy ? () => undefined : onCancel}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={busy} data-close>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Creating…' : `Create ${kind}`}
          </button>
        </>
      }
    >
      {freezesBaseline && (
        <div className="banner banner-warn">
          <div className="banner-body">
            <strong>This freezes the baseline.</strong>
            <span>
              Once the first shock exists, the baseline becomes read-only so every comparison keeps a stable starting point.
              To change it later you would start a new project.
            </span>
          </div>
        </div>
      )}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label" style={{ marginBottom: 6 }}>
          Type
        </legend>
        <div className="radio-cards">
          {presets.map((p) => (
            <label className="radio-card" key={p.id}>
              <input type="radio" name="preset" checked={presetId === p.id} onChange={() => choose(p.id)} />
              <div>
                <strong>{p.title}</strong>
                <span>{p.blurb}</span>
              </div>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="fork-name">Scenario name</label>
        <input
          id="fork-name"
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setNameTouched(true);
          }}
          aria-invalid={Boolean(errors.name)}
        />
        {errors.name && <span className="error-text">{errors.name}</span>}
      </div>
      {preset.fields.map((f) => (
        <div className="field" key={f.key}>
          <label htmlFor={`fork-${f.key}`}>
            {f.label} ({unitHint(f.key, currency)})
          </label>
          <input
            id={`fork-${f.key}`}
            inputMode="decimal"
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            aria-invalid={Boolean(errors[f.key])}
            placeholder={f.key === 'monthlyUnits' && preset.id === 'price' ? 'Your estimate' : undefined}
          />
          <span className="hint">
            Currently {fmt(f.key, sourceValue(f.key))} in “{source.name}”.
            {f.key === 'monthlyUnits' && preset.id === 'price' &&
              ' Knock-On does not model how customers react to price. Enter what you expect — type the current figure if you expect no change.'}
          </span>
          {errors[f.key] && <span className="error-text">{errors[f.key]}</span>}
        </div>
      ))}
      {preset.fields.length > 0 && (
        <div className="field">
          <label htmlFor="fork-note">{preset.id === 'price' ? 'Why you expect these sales (optional)' : 'Note (optional)'}</label>
          <input id="fork-note" value={note} maxLength={1500} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      {submitError && (
        <div className="banner banner-error" role="alert">
          <div className="banner-body">{submitError}</div>
        </div>
      )}
    </Dialog>
  );
}
