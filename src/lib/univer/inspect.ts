/**
 * Result inspection from the template mappings: a result's formula, the cells it
 * references directly, and the template inputs behind it, with the values Univer
 * calculated. Pure lookups, no arithmetic, so it works for a live draft (browser
 * Univer projection) and for a saved scenario (server projection) alike.
 */
import {
  BAKERY_INPUTS,
  BAKERY_RESULTS,
  BAKERY_RESULT_INPUTS,
  type BakeryInputKey,
  type BakeryResultKey,
} from '@/lib/templates/bakery';

export interface InspectedCell {
  key: string;
  cell: string;
  label: string;
  value: number | null;
  kind: 'input' | 'result';
}

export interface Inspection {
  key: BakeryResultKey;
  cell: string;
  label: string;
  formula: string;
  value: number | null;
  /** Cells the formula names directly, in formula order (ranges expanded). */
  references: InspectedCell[];
  /** Every template input that ultimately feeds this result. */
  contributingInputs: InspectedCell[];
}

export interface ProjectionLike {
  inputs: Partial<Record<string, number | null>>;
  metrics: Partial<Record<string, number | null>>;
}

const CELL_INDEX = new Map<string, { key: string; label: string; kind: 'input' | 'result' }>([
  ...BAKERY_INPUTS.map((m) => [m.cell, { key: m.key, label: m.label, kind: 'input' as const }] as const),
  ...BAKERY_RESULTS.map((m) => [m.cell, { key: m.key, label: m.label, kind: 'result' as const }] as const),
]);

/** Expand the column-B references in a template formula ("B5:B9" → B5…B9). */
export function formulaReferences(formula: string): string[] {
  const refs: string[] = [];
  const pattern = /\b([A-Z])(\d+)(?::([A-Z])(\d+))?\b/g;
  for (const match of formula.matchAll(pattern)) {
    const [, col, startRow, endCol, endRow] = match;
    if (endCol && endRow && endCol === col) {
      for (let r = Number(startRow); r <= Number(endRow); r++) refs.push(`${col}${r}`);
    } else {
      refs.push(`${col}${startRow}`);
    }
  }
  return [...new Set(refs)];
}

function cellValue(kind: 'input' | 'result', key: string, projection: ProjectionLike): number | null {
  const raw = kind === 'input' ? projection.inputs[key] : projection.metrics[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

export function isResultKey(key: string): key is BakeryResultKey {
  return BAKERY_RESULTS.some((r) => r.key === key);
}

export function resultKeyForCell(row: number, col: number): BakeryResultKey | null {
  const found = BAKERY_RESULTS.find((r) => r.row === row && r.col === col);
  return found ? (found.key as BakeryResultKey) : null;
}

export function inputKeyForCell(row: number, col: number): BakeryInputKey | null {
  const found = BAKERY_INPUTS.find((r) => r.row === row && r.col === col);
  return found ? (found.key as BakeryInputKey) : null;
}

export function inspectResult(key: BakeryResultKey, projection: ProjectionLike): Inspection {
  const mapping = BAKERY_RESULTS.find((r) => r.key === key);
  if (!mapping) throw new Error(`Unknown result ${key}`);
  const references = formulaReferences(mapping.formula)
    .map((cell): InspectedCell | null => {
      const meta = CELL_INDEX.get(cell);
      if (!meta) return null;
      return { key: meta.key, cell, label: meta.label, kind: meta.kind, value: cellValue(meta.kind, meta.key, projection) };
    })
    .filter((c): c is InspectedCell => c !== null);
  const contributingInputs = BAKERY_RESULT_INPUTS[key].map((inputKey): InspectedCell => {
    const m = BAKERY_INPUTS.find((i) => i.key === inputKey)!;
    return { key: m.key, cell: m.cell, label: m.label, kind: 'input', value: cellValue('input', m.key, projection) };
  });
  return {
    key,
    cell: mapping.cell,
    label: mapping.label,
    formula: mapping.formula,
    value: cellValue('result', key, projection),
    references,
    contributingInputs,
  };
}
