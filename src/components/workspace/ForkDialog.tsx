'use client';
/**
 * New shock or response: pick what changed, enter the number(s), done.
 * The scenario is named from what changed, so there is no name field.
 */
import { useState } from 'react';
import type { Assumption, Project, Scenario } from '@/lib/contracts/project';
import { formatMoney, formatNumber, parseNumberInput } from '@/lib/format';
import { BAKERY_INPUTS, type BakeryInputKey } from '@/lib/templates/bakery';
import { Dialog } from '@/components/ui/Dialog';
import { KnockyPose } from '@/components/ui/KnockyPose';

export interface ForkSpec {
  kind: 'shock' | 'response';
  sourceId: string;
  name: string;
  changes: Partial<Record<BakeryInputKey, number>>;
  /** Assumptions to add or replace on the new scenario. */
  assumptions: Assumption[];
}

type Values = Partial<Record<BakeryInputKey, number>>;
type Preset = {
  id: string;
  title: string;
  fields: { key: BakeryInputKey; label: string }[];
  name: (v: Values, money: (n: number) => string) => string;
};

const SHOCKS: Preset[] = [
  {
    id: 'energy',
    title: 'Energy or fuel costs rise',
    fields: [{ key: 'monthlyEnergy', label: 'New monthly energy cost' }],
    name: (v, m) => `Energy ${m(v.monthlyEnergy!)}/month`,
  },
  {
    id: 'supplier-price',
    title: 'Supplier raises prices',
    fields: [{ key: 'ingredientCostPerUnit', label: 'New ingredient cost per unit' }],
    name: (v, m) => `Ingredients ${m(v.ingredientCostPerUnit!)}/unit`,
  },
  {
    id: 'sales-decline',
    title: 'Sales fall',
    fields: [{ key: 'monthlyUnits', label: 'New units sold per month' }],
    name: (v) => `Sales ${formatNumber(v.monthlyUnits!)}/month`,
  },
];

const RESPONSES: Preset[] = [
  {
    id: 'price',
    title: 'Change the price',
    fields: [
      { key: 'unitPrice', label: 'New price per unit' },
      { key: 'monthlyUnits', label: 'Units you expect to sell per month at that price' },
    ],
    name: (v, m) => `Price ${m(v.unitPrice!)}`,
  },
  {
    id: 'supplier-switch',
    title: 'Switch supplier',
    fields: [
      { key: 'ingredientCostPerUnit', label: 'New ingredient cost per unit' },
      { key: 'monthlyDelivery', label: 'Monthly delivery cost' },
    ],
    name: (v, m) => `New supplier ${m(v.ingredientCostPerUnit!)}/unit`,
  },
];

function uniqueName(project: Project, base: string): string {
  const taken = new Set(project.scenarios.map((s) => s.name));
  let name = base.slice(0, 80);
  for (let i = 2; taken.has(name); i++) name = `${base.slice(0, 74)} (${i})`;
  return name;
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
  const [text, setText] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = source.calculation.inputs;
  const money = (n: number) => formatMoney(n, project.currency);
  const show = (key: BakeryInputKey) => (key === 'monthlyUnits' ? `${formatNumber(current[key] ?? null)} units` : money(current[key] ?? 0));
  const freezesBaseline = kind === 'shock' && !project.baselineFrozen;

  async function submit() {
    const errs: Record<string, string> = {};
    const values: Values = {};
    for (const f of preset.fields) {
      const parsed = parseNumberInput(text[f.key] ?? '');
      if (parsed === null) errs[f.key] = preset.id === 'price' && f.key === 'monthlyUnits' ? 'Enter the sales you expect. KnockOn won’t guess.' : 'Enter a number.';
      else if (parsed < 0) errs[f.key] = 'Must be zero or more.';
      else values[f.key] = parsed;
    }
    if (preset.id === 'price' && values.unitPrice !== undefined && values.unitPrice === current.unitPrice) {
      errs.unitPrice = 'That’s the current price.';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const assumptions: Assumption[] = preset.fields.map((f) => {
      const to = values[f.key]!;
      if (preset.id === 'price' && f.key === 'monthlyUnits') {
        return {
          inputKey: 'monthlyUnits',
          note: `Expected sales at ${money(values.unitPrice!)}: ${formatNumber(to)} units a month (your estimate).`,
          source: 'user',
          confirmed: true,
          confirmedFor: { unitPrice: values.unitPrice!, monthlyUnits: to },
        };
      }
      const label = BAKERY_INPUTS.find((m) => m.key === f.key)?.label ?? f.key;
      return { inputKey: f.key, note: `${label}: ${show(f.key)} → ${f.key === 'monthlyUnits' ? `${formatNumber(to)} units` : money(to)}.`, source: 'user', confirmed: true };
    });

    setBusy(true);
    setSubmitError(null);
    try {
      await onSubmit({ kind, sourceId: source.id, name: uniqueName(project, preset.name(values, money)), changes: values, assumptions });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not create the scenario.');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={kind === 'shock' ? 'What changed?' : `How do you respond to “${source.name}”?`}
      illustration={<KnockyPose pose={kind === 'shock' ? 'knock' : 'gotit'} width={kind === 'shock' ? 140 : 104} />}
      onClose={busy ? () => undefined : onCancel}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={busy} data-close>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Creating…' : kind === 'shock' ? 'Add shock' : 'Add response'}
          </button>
        </>
      }
    >
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr-only">Type</legend>
        <div className="radio-cards">
          {presets.map((p) => (
            <label className="radio-card" key={p.id}>
              <input
                type="radio"
                name="preset"
                checked={presetId === p.id}
                onChange={() => {
                  setPresetId(p.id);
                  setErrors({});
                }}
              />
              <strong>{p.title}</strong>
            </label>
          ))}
        </div>
      </fieldset>
      {preset.fields.map((f) => (
        <div className="field" key={f.key}>
          <label htmlFor={`fork-${f.key}`}>{f.label}</label>
          <input
            id={`fork-${f.key}`}
            inputMode="decimal"
            value={text[f.key] ?? ''}
            onChange={(e) => setText((v) => ({ ...v, [f.key]: e.target.value }))}
            aria-invalid={Boolean(errors[f.key])}
          />
          <span className="hint">Now {show(f.key)}.</span>
          {errors[f.key] && <span className="error-text">{errors[f.key]}</span>}
        </div>
      ))}
      {freezesBaseline && <p className="small muted">The baseline will be locked so every comparison starts from the same figures.</p>}
      {submitError && (
        <div className="banner banner-error" role="alert">
          <div className="banner-body">{submitError}</div>
        </div>
      )}
    </Dialog>
  );
}
