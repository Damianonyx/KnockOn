import type { CalculationError } from '@/lib/contracts/project';
import type { BakeryInputKey, BakeryResultKey } from '@/lib/templates/bakery';
import type { SnapshotIssue } from '@/lib/univer/snapshot';

/** What the browser Univer instance currently shows for the active draft. */
export interface LiveState {
  inputs: Record<BakeryInputKey, number | null>;
  raw: Record<BakeryInputKey, unknown>;
  metrics: Record<BakeryResultKey, number | null>;
  errors: CalculationError[];
  issues: SnapshotIssue[];
}

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'failed' | 'conflict' | 'readonly';

export interface SaveProblem {
  message: string;
  code?: string;
  fields: Record<string, string>;
  invalidCells: CalculationError[];
}

export type InspectTarget = { key: BakeryResultKey; source: 'draft' } | { key: BakeryResultKey; source: 'saved'; scenarioId: string };

/** Units are a count; every other input is money. */
export function isMoneyInput(key: string): boolean {
  return key !== 'monthlyUnits';
}
