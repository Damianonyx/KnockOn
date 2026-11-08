/**
 * Scenario helpers for the interface: ordering, parent lookups, input diffs,
 * the price-change confirmation rule, and comparisons of saved results. No
 * revenue, cost, or profit arithmetic happens here; profit change against the
 * baseline compares two Univer-calculated profit values, as the API contract
 * prescribes for comparisons.
 */
import type { Assumption, Project, Scenario } from '@/lib/contracts/project';
import { BAKERY_INPUTS, type BakeryInputKey } from '@/lib/templates/bakery';

export type InputValues = Partial<Record<BakeryInputKey, number | null>>;

/** Baseline first, then each shock followed by its responses, in creation order. */
export function orderScenarios(project: Project): Scenario[] {
  const baseline = project.scenarios.find((s) => s.id === project.baselineScenarioId);
  const shocks = project.scenarios.filter((s) => s.kind === 'shock');
  const ordered: Scenario[] = baseline ? [baseline] : [];
  for (const shock of shocks) {
    ordered.push(shock, ...project.scenarios.filter((s) => s.kind === 'response' && s.parentScenarioId === shock.id));
  }
  for (const s of project.scenarios) if (!ordered.includes(s)) ordered.push(s);
  return ordered;
}

export function findScenario(project: Project, id: string | null | undefined): Scenario | undefined {
  return id ? project.scenarios.find((s) => s.id === id) : undefined;
}

export function parentOf(project: Project, scenario: Scenario): Scenario | undefined {
  return findScenario(project, scenario.parentScenarioId);
}

export function baselineOf(project: Project): Scenario | undefined {
  return findScenario(project, project.baselineScenarioId);
}

export function isReadOnly(project: Project, scenario: Scenario): boolean {
  return scenario.kind === 'baseline' && project.baselineFrozen;
}

export interface InputChange {
  key: BakeryInputKey;
  cell: string;
  label: string;
  from: number | null;
  to: number | null;
}

/** Inputs whose values differ from the parent's saved inputs. */
export function changedInputs(current: InputValues, parent: InputValues | undefined): InputChange[] {
  if (!parent) return [];
  return BAKERY_INPUTS.filter((m) => (current[m.key as BakeryInputKey] ?? null) !== (parent[m.key as BakeryInputKey] ?? null)).map(
    (m) => ({
      key: m.key as BakeryInputKey,
      cell: m.cell,
      label: m.label,
      from: parent[m.key as BakeryInputKey] ?? null,
      to: current[m.key as BakeryInputKey] ?? null,
    }),
  );
}

export type PriceConfirmation =
  | { required: false }
  | { required: true; status: 'confirmed' | 'missing' | 'stale'; parentPrice: number | null; price: number | null; units: number | null };

/**
 * The rule from docs/API_CONTRACT.md: when the price differs from the parent's,
 * a `monthlyUnits` assumption from the user must be confirmed for exactly the
 * current price and units. Changing either again makes it stale.
 */
export function priceConfirmation(
  current: InputValues,
  parent: InputValues | undefined,
  assumptions: Assumption[],
): PriceConfirmation {
  if (!parent) return { required: false };
  const price = current.unitPrice ?? null;
  const parentPrice = parent.unitPrice ?? null;
  if (price === parentPrice) return { required: false };
  const units = current.monthlyUnits ?? null;
  const a = assumptions.find((x) => x.inputKey === 'monthlyUnits');
  let status: 'confirmed' | 'missing' | 'stale' = 'missing';
  if (a && a.source === 'user' && a.confirmed && a.confirmedFor) {
    status = a.confirmedFor.unitPrice === price && a.confirmedFor.monthlyUnits === units ? 'confirmed' : 'stale';
  } else if (a?.confirmed) {
    status = 'stale';
  }
  return { required: true, status, parentPrice, price, units };
}

/** Replace (or add) the assumption for one input. */
export function upsertAssumption(list: Assumption[], next: Assumption): Assumption[] {
  const i = list.findIndex((a) => a.inputKey === next.inputKey);
  if (i === -1) return [...list, next];
  const copy = [...list];
  copy[i] = next;
  return copy;
}

/** Record that the user explicitly entered or confirmed expected monthly sales for a price. */
export function confirmMonthlyUnits(list: Assumption[], unitPrice: number, monthlyUnits: number, note: string): Assumption[] {
  return upsertAssumption(list, {
    inputKey: 'monthlyUnits',
    note: note.trim() || `Expected monthly sales of ${monthlyUnits} at a price of ${unitPrice}, entered by the user.`,
    source: 'user',
    confirmed: true,
    confirmedFor: { unitPrice, monthlyUnits },
  });
}

/** Difference between two saved, Univer-calculated values (null when either is missing). */
export function changeAgainst(value: number | null | undefined, reference: number | null | undefined): number | null {
  if (typeof value !== 'number' || typeof reference !== 'number') return null;
  return value - reference;
}

/** True when two assumption lists hold the same entries (order-insensitive). */
export function sameAssumptions(a: Assumption[], b: Assumption[]): boolean {
  if (a.length !== b.length) return false;
  const key = (x: Assumption) => JSON.stringify([x.inputKey, x.note, x.source, x.confirmed, x.confirmedFor ?? null]);
  const setB = new Set(b.map(key));
  return a.every((x) => setB.has(key(x)));
}

export const KIND_LABEL: Record<Scenario['kind'], string> = {
  baseline: 'Baseline',
  shock: 'Shock',
  response: 'Response',
};
