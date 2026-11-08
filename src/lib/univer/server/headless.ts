/**
 * Headless workbook adapter for the Node.js server.
 *
 * Runs the real Univer sheet model and formula engine without a DOM:
 * load a snapshot, force a full recalculation, wait for the engine's
 * completion signal, then read values back out of the exported snapshot.
 * Client-supplied cached metrics are never trusted; this is the server's
 * own calculation (docs/BUILD_BRIEF.md, "Calculation rules").
 */
import { ICommandService, LogLevel, Univer, UniverInstanceType, type Workbook } from '@univerjs/core';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import {
  ICalculateFormulaService,
  SetFormulaCalculationStartMutation,
  UniverFormulaEnginePlugin,
} from '@univerjs/engine-formula';
import { firstValueFrom, timeout } from 'rxjs';
import { validateBakerySnapshot } from '../snapshot';
import { readBakeryProjection, type BakeryProjection } from '../calculate';
import {
  BAKERY_INPUTS,
  BAKERY_RESULTS,
  BAKERY_RESULT_INPUTS,
  type BakeryInputKey,
  type BakeryResultKey,
} from '@/lib/templates/bakery';
import {
  RecalculationError,
  SnapshotValidationError,
  type DisposeListener,
  type IWorkbookAdapter,
  type ResultInspection,
  type WorkbookChangeListener,
} from '../adapter';

/** Milliseconds to wait for one recalculation before declaring it stuck. */
const RECALC_TIMEOUT_MS = 10_000;

export class HeadlessWorkbookAdapter implements IWorkbookAdapter {
  private readonly univer: Univer;
  private workbook: Workbook | null = null;
  private listeners = new Set<WorkbookChangeListener>();

  constructor() {
    this.univer = new Univer({ logLevel: LogLevel.SILENT });
    this.univer.registerPlugin(UniverSheetsPlugin);
    this.univer.registerPlugin(UniverFormulaEnginePlugin);
  }

  async load(workbook: unknown): Promise<void> {
    const validation = validateBakerySnapshot(workbook);
    if (!validation.ok) {
      throw new SnapshotValidationError(validation.issues);
    }
    this.workbook = this.univer.createUnit(UniverInstanceType.UNIVER_SHEET, validation.workbook);
    await this.waitForRecalculation();
  }

  dispose(): void {
    this.listeners.clear();
    this.univer.dispose();
  }

  getInput(key: BakeryInputKey): number | null {
    const mapping = BAKERY_INPUTS.find((i) => i.key === key);
    if (!mapping) return null;
    const value = this.snapshotCell(mapping.row, mapping.col)?.v;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  async setInput(key: BakeryInputKey, value: number): Promise<void> {
    const mapping = BAKERY_INPUTS.find((i) => i.key === key);
    if (!mapping) return;
    // Write through the snapshot and reload so the engine recalculates from a
    // consistent state. The server only ever loads full snapshots in
    // production paths; this supports fixture building and tests.
    const snapshot = this.exportSnapshot() as Record<string, unknown>;
    const sheet = (snapshot.sheets as Record<string, Record<string, unknown>>)['model'];
    const cellData = sheet.cellData as Record<string, Record<string, Record<string, unknown>>>;
    cellData[mapping.row] = cellData[mapping.row] ?? {};
    cellData[mapping.row][mapping.col] = { v: value };
    await this.load(snapshot);
    this.emitChange();
  }

  async waitForRecalculation(): Promise<void> {
    if (!this.workbook) return;
    const injector = (this.univer as unknown as { __getInjector(): { get<T>(id: unknown): T } }).__getInjector();
    const calculate = injector.get(ICalculateFormulaService);
    const completed = firstValueFrom(calculate.executionCompleteListener$.pipe(timeout(RECALC_TIMEOUT_MS))).catch(
      () => null,
    );
    const executed = injector
      .get(ICommandService)
      .executeCommand(SetFormulaCalculationStartMutation.id, {
        forceCalculation: true,
        dirtyRanges: [],
        dirtyNameMap: {},
        dirtyDefinedNameMap: {},
        dirtySuperTableMap: {},
        dirtyUnitFeatureMap: {},
        dirtyUnitOtherFormulaMap: {},
        clearDependencyTreeCache: {},
      });
    if (!executed) {
      throw new RecalculationError('Univer rejected the recalculation command.');
    }
    await completed;
  }

  readProjection(): BakeryProjection {
    const projection = readBakeryProjection(this.exportSnapshot());
    if (projection.errors.length > 0) {
      // Surface formula errors instead of converting them to zero.
      return projection;
    }
    return projection;
  }

  exportSnapshot(): unknown {
    return this.workbook?.getSnapshot();
  }

  inspectResult(key: BakeryResultKey): ResultInspection {
    const mapping = BAKERY_RESULTS.find((r) => r.key === key)!;
    const snapshot = this.exportSnapshot() as Record<string, unknown>;
    const sheet = (snapshot.sheets as Record<string, Record<string, unknown>>)['model'];
    const cellData = sheet.cellData as Record<string, Record<string, Record<string, unknown>>>;
    const inputs = BAKERY_RESULT_INPUTS[key].map((inputKey) => {
      const input = BAKERY_INPUTS.find((i) => i.key === inputKey)!;
      return {
        key: input.key,
        cell: input.cell,
        label: input.label,
        value: (cellData[input.row]?.[input.col]?.v as number) ?? 0,
      };
    });
    return {
      key,
      cell: mapping.cell,
      label: mapping.label,
      formula: mapping.formula,
      contributingInputs: inputs,
    };
  }

  onChange(listener: WorkbookChangeListener): DisposeListener {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitChange(): void {
    for (const listener of this.listeners) listener();
  }

  private snapshotCell(row: number, col: number): { v?: unknown; f?: string | null; t?: number } | undefined {
    const snapshot = this.exportSnapshot() as Record<string, unknown> | undefined;
    const sheet = snapshot?.sheets as Record<string, Record<string, unknown>> | undefined;
    const cellData = sheet?.['model']?.cellData as
      | Record<string, Record<string, Record<string, unknown>>>
      | undefined;
    return cellData?.[row]?.[col] as { v?: unknown; f?: string | null; t?: number } | undefined;
  }

}

/**
 * Deep-copy a workbook snapshot and allocate a fresh workbook id, so a forked
 * scenario never aliases its source (docs/API_CONTRACT.md, "kind"). Uses
 * structuredClone so formulas and formatting survive.
 */
export function deepCopyWorkbook(workbook: unknown, newId: string): Record<string, unknown> {
  const copy = structuredClone(workbook) as Record<string, unknown>;
  copy.id = newId;
  return copy;
}
