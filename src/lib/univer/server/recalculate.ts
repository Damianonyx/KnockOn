/**
 * Server-side recalculation with the real Univer formula engine (no DOM).
 *
 * Every save and fork goes through `recalculateWorkbook`: validate the snapshot
 * against the template, drop any cached formula results the client sent, load
 * it into a fresh headless Univer instance, force a full calculation, wait
 * until the results are written back into the sheet, then read the projection.
 * The server never trusts client-supplied results (docs/BUILD_BRIEF.md,
 * "Calculation rules").
 */
import { ICommandService, LocaleType, LogLevel, mergeLocales, Univer, UniverInstanceType, type IWorkbookData } from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import {
  FormulaCalculationSessionService,
  SetTriggerFormulaCalculationStartMutation,
  UniverFormulaEnginePlugin,
} from '@univerjs/engine-formula';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula';
import { UniverDrawingPlugin } from '@univerjs/drawing';
import { UniverSheetsDrawingPlugin } from '@univerjs/sheets-drawing';
import { UniverSheetsChartPlugin } from '@univerjs-pro/sheets-chart';
import SheetsChartEnUS from '@univerjs-pro/sheets-chart/locale/en-US';
import EngineChartEnUS from '@univerjs-pro/engine-chart/locale/en-US';
import { UniverLicensePlugin } from '@univerjs-pro/license';
import '@univerjs/sheets/facade';
import '@univerjs-pro/sheets-chart/facade';
import { BAKERY_SHEET_ID } from '@/lib/templates/bakery';
import { readBakeryProjection, type BakeryProjection } from '../calculate';
import { validateBakerySnapshot, withoutCachedResults, type BakeryWorkbook, type SnapshotIssue } from '../snapshot';
import { CHART_RESOURCE, DRAWING_RESOURCE } from '../chart-resources';

/** Longest a single recalculation may take before the request fails. */
const RECALC_TIMEOUT_MS = 10_000;

export class WorkbookValidationError extends Error {
  constructor(public readonly issues: SnapshotIssue[]) {
    super(issues.map((i) => i.message).join(' '));
    this.name = 'WorkbookValidationError';
  }
}

export class RecalculationTimeoutError extends Error {
  constructor() {
    super('The spreadsheet did not finish calculating in time.');
    this.name = 'RecalculationTimeoutError';
  }
}

export interface RecalculatedWorkbook {
  /** Snapshot exported from Univer after calculation: formulas intact, results filled in. */
  workbook: BakeryWorkbook;
  projection: BakeryProjection;
}

interface InjectorAccess {
  __getInjector(): { get<T>(token: unknown): T };
}

/**
 * Validate and recalculate a bakery workbook. Throws WorkbookValidationError
 * for template violations and RecalculationTimeoutError if Univer stalls.
 * Formula errors are returned in `projection.errors`, not thrown.
 */
export async function recalculateWorkbook(snapshot: unknown): Promise<RecalculatedWorkbook> {
  const validation = validateBakerySnapshot(snapshot);
  if (!validation.ok) throw new WorkbookValidationError(validation.issues);
  const input = withoutCachedResults(validation.workbook);
  // Persist supported chart resources only, not arbitrary drawing/OLE or permission plugins submitted by a client.
  if (Array.isArray(input.resources)) input.resources = input.resources.filter((r) => [CHART_RESOURCE, DRAWING_RESOURCE].includes(r.name));

  const workbook = await calculateTrustedWorkbook(input);
  workbook.sheetOrder = [BAKERY_SHEET_ID];
  return { workbook, projection: readBakeryProjection(workbook) };
}

/** Internal engine boundary. Callers must validate user snapshots or construct all cells themselves. */
export async function calculateTrustedWorkbook(input: BakeryWorkbook, afterCalculation?: (api: FUniver) => Promise<void>): Promise<BakeryWorkbook> {
  // A fresh instance per calculation keeps requests isolated (no shared unit
  // ids or state between users) and is fast enough for the bakery template.
  const univer = new Univer({ logLevel: LogLevel.SILENT, locale: LocaleType.EN_US, locales: { [LocaleType.EN_US]: mergeLocales(EngineChartEnUS, SheetsChartEnUS) } });
  try {
    if (process.env.UNIVER_LICENSE?.trim()) univer.registerPlugin(UniverLicensePlugin, { license: process.env.UNIVER_LICENSE.trim() });
    univer.registerPlugin(UniverSheetsPlugin);
    univer.registerPlugin(UniverFormulaEnginePlugin);
    univer.registerPlugin(UniverSheetsFormulaPlugin);
    univer.registerPlugin(UniverDrawingPlugin);
    univer.registerPlugin(UniverSheetsDrawingPlugin);
    univer.registerPlugin(UniverSheetsChartPlugin);
    const unit = univer.createUnit(UniverInstanceType.UNIVER_SHEET, input as unknown as Partial<IWorkbookData>);
    const injector = (univer as unknown as InjectorAccess).__getInjector();

    const started = await injector
      .get<ICommandService>(ICommandService)
      .executeCommand(SetTriggerFormulaCalculationStartMutation.id, { commands: [], forceCalculation: true }, { onlyLocal: true });
    if (!started) throw new Error('Univer did not start the calculation.');

    try {
      await injector.get<FormulaCalculationSessionService>(FormulaCalculationSessionService).waitForLatestApplied(RECALC_TIMEOUT_MS);
    } catch {
      throw new RecalculationTimeoutError();
    }

    // Facade save includes plugin resources; Workbook.getSnapshot() alone loses chart models and anchors.
    const api = FUniver.newAPI(univer);
    if (afterCalculation) await afterCalculation(api);
    const workbook = api.getWorkbook(unit.getUnitId())!.save() as unknown as BakeryWorkbook;
    return workbook;
  } finally {
    univer.dispose();
  }
}
