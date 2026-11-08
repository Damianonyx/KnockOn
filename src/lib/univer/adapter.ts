/**
 * Browser editor adapter boundary (docs/API_CONTRACT.md, "Editor adapter
 * contract"). UI components never call Univer directly; they go through this
 * interface. The browser implementation is part of the interface work. The
 * server does not use this interface: it recalculates whole snapshots with
 * `recalculateWorkbook` in ./server/recalculate.ts. Both sides share the
 * template mappings, snapshot validation, and projection reader.
 */
import type { BakeryProjection } from './calculate';
import type { BakeryInputKey, BakeryResultKey } from '@/lib/templates/bakery';

export interface ResultInspection {
  key: BakeryResultKey;
  cell: string;
  label: string;
  formula: string;
  contributingInputs: { key: BakeryInputKey; cell: string; label: string; value: number | null }[];
}

export type WorkbookChangeListener = () => void;
export type DisposeListener = () => void;

export interface IWorkbookAdapter {
  /** Load a scenario workbook and wait for its first calculation. */
  load(workbook: unknown): Promise<void>;
  /** Release the underlying Univer instance. */
  dispose(): void;
  /** Read one input by template key; null when blank or not a number. */
  getInput(key: BakeryInputKey): number | null;
  /** Set one input by template key and wait for recalculation. */
  setInput(key: BakeryInputKey, value: number): Promise<void>;
  /** Resolve once the latest recalculation has been applied to the sheet. */
  waitForRecalculation(): Promise<void>;
  /** Completed input/metric projection plus cell-level formula errors. */
  readProjection(): BakeryProjection;
  /** Export the full snapshot, formulas and formatting included. */
  exportSnapshot(): unknown;
  /** A mapped result's formula and the input cells that feed it. */
  inspectResult(key: BakeryResultKey): ResultInspection;
  /** Observe user edits. Not fired while a snapshot is being loaded. */
  onChange(listener: WorkbookChangeListener): DisposeListener;
}
