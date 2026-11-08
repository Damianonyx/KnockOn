/**
 * Application-owned workbook adapter boundary (docs/API_CONTRACT.md, "Editor
 * adapter contract"). Components never call Univer directly; they go through
 * this interface. The browser implementation (client/editor.ts) and the
 * headless server implementation (server/headless.ts) share the template
 * mappings and snapshot schema but do not share browser UI imports.
 */
import type { BakeryProjection } from './calculate';
import type { BakeryResultKey, BakeryInputKey } from '@/lib/templates/bakery';

export interface ResultInspection {
  key: BakeryResultKey;
  cell: string;
  label: string;
  formula: string;
  contributingInputs: { key: BakeryInputKey; cell: string; label: string; value: number }[];
}

export type WorkbookChangeListener = () => void;
export type DisposeListener = () => void;

export interface IWorkbookAdapter {
  /** Load and recalculate a scenario workbook. Throws SnapshotValidationError on template violations. */
  load(workbook: unknown): Promise<void>;
  /** Release the underlying Univer instance. */
  dispose(): void;
  /** Read one input by template key; null when blank. */
  getInput(key: BakeryInputKey): number | null;
  /** Set one input by template key and recalculate. */
  setInput(key: BakeryInputKey, value: number): Promise<void>;
  /** Resolve once the next recalculation has fully applied. */
  waitForRecalculation(): Promise<void>;
  /** Completed input/metric projection plus cell-level formula errors. */
  readProjection(): BakeryProjection;
  /** Export the full snapshot, formulas and formatting included. */
  exportSnapshot(): unknown;
  /** A mapped result's formula and the input cells that feed it. */
  inspectResult(key: BakeryResultKey): ResultInspection;
  /** Observe workbook changes; suppresses while loading snapshots. */
  onChange(listener: WorkbookChangeListener): DisposeListener;
}

/** Thrown when a submitted workbook does not match the bakery template shape. */
export class SnapshotValidationError extends Error {
  constructor(
    public readonly issues: { field: string; message: string }[],
  ) {
    super(`Workbook snapshot rejected: ${issues.map((i) => i.message).join(' ')}`);
    this.name = 'SnapshotValidationError';
  }
}

/** Thrown when recalculation does not finish in time. */
export class RecalculationError extends Error {
  constructor(message = 'Recalculation did not complete in time.') {
    super(message);
    this.name = 'RecalculationError';
  }
}
