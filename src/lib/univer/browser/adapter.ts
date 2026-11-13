/**
 * Browser implementation of the editor adapter (docs/API_CONTRACT.md, "Editor
 * adapter contract"). Components talk to this class, never to Univer directly.
 *
 * - Univer is the only calculation engine: inputs are written into the real
 *   workbook and metrics are read back after Univer's formula engine applies
 *   its results.
 * - The bakery layout is protected: only numbers in the eight input cells
 *   (B2:B9) can change. Formula cells, labels, and structural commands are
 *   blocked before they run. A frozen baseline blocks every value change.
 * - Change listeners are suppressed while a snapshot loads, so loading a server
 *   response never looks like a user edit (no save loops).
 *
 * Import this module only from client components loaded with ssr: false.
 */
import {
  CommandType,
  CustomCommandExecutionError,
  ICommandService,
  IUniverInstanceService,
  LocaleType,
  LogLevel,
  Univer,
  UniverInstanceType,
  mergeLocales,
  type ICommandInfo,
  type IExecutionOptions,
  type IDisposable,
  type IWorkbookData,
  type Workbook,
} from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import { defaultTheme } from '@univerjs/themes';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import {
  FormulaCalculationSessionService,
  SetTriggerFormulaCalculationStartMutation,
  UniverFormulaEnginePlugin,
} from '@univerjs/engine-formula';
import { UniverUIPlugin } from '@univerjs/ui';
import { UniverDocsPlugin } from '@univerjs/docs';
import { UniverDocsUIPlugin } from '@univerjs/docs-ui';
import { SetRangeValuesCommand, SetRangeValuesMutation, UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui';
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula';
import { UniverSheetsFormulaUIPlugin } from '@univerjs/sheets-formula-ui';
import { UniverLicensePlugin } from '@univerjs-pro/license';
import { UniverDrawingPlugin } from '@univerjs/drawing';
import { UniverDrawingUIPlugin } from '@univerjs/drawing-ui';
import { SetDrawingApplyMutation, UniverSheetsDrawingPlugin } from '@univerjs/sheets-drawing';
import { UniverSheetsDrawingUIPlugin } from '@univerjs/sheets-drawing-ui';
import {
  ChartUpdateConfigMutation, ChartUpdateSourceConfigMutation, InsertSheetsChartMutation,
  RemoveSheetsChartMutation, UniverSheetsChartPlugin,
} from '@univerjs-pro/sheets-chart';
import { UniverSheetsChartUIPlugin } from '@univerjs-pro/sheets-chart-ui';
import { ISheetPrintManagerService, SheetPrintOpenOperation, UniverSheetsPrintPlugin } from '@univerjs-pro/sheets-print';
import '@univerjs/sheets/facade';
import '@univerjs/sheets-ui/facade';
import '@univerjs-pro/sheets-chart/facade';
import '@univerjs-pro/chart-ui/facade';
import '@univerjs-pro/sheets-print/facade';
import DesignEnUS from '@univerjs/design/locale/en-US';
import UIEnUS from '@univerjs/ui/locale/en-US';
import DocsUIEnUS from '@univerjs/docs-ui/locale/en-US';
import SheetsEnUS from '@univerjs/sheets/locale/en-US';
import SheetsUIEnUS from '@univerjs/sheets-ui/locale/en-US';
import SheetsFormulaEnUS from '@univerjs/sheets-formula/locale/en-US';
import SheetsFormulaUIEnUS from '@univerjs/sheets-formula-ui/locale/en-US';
import DrawingUIEnUS from '@univerjs/drawing-ui/locale/en-US';
import SheetsDrawingUIEnUS from '@univerjs/sheets-drawing-ui/locale/en-US';
import ChartUIEnUS from '@univerjs-pro/chart-ui/locale/en-US';
import EngineChartEnUS from '@univerjs-pro/engine-chart/locale/en-US';
import SheetsChartEnUS from '@univerjs-pro/sheets-chart/locale/en-US';
import SheetsChartUIEnUS from '@univerjs-pro/sheets-chart-ui/locale/en-US';
import SheetsPrintEnUS from '@univerjs-pro/sheets-print/locale/en-US';
import { BAKERY_INPUTS, BAKERY_SHEET_ID, type BakeryInputKey, type BakeryResultKey } from '@/lib/templates/bakery';
import type { IWorkbookAdapter, ResultInspection } from '../adapter';
import { readBakeryProjection, type BakeryProjection } from '../calculate';
import type { BakeryWorkbook } from '../snapshot';
import { inspectResult as inspectFromProjection } from '../inspect';
import { MAX_SCENARIO_CHARTS } from '../chart-resources';

/** CellValueType.NUMBER in Univer. */
const NUMBER_TYPE = 2;
const RECALC_TIMEOUT_MS = 10_000;

const INPUT_POSITIONS = new Set(BAKERY_INPUTS.map((m) => `${m.row}:${m.col}`));
const CHART_MUTATIONS = new Set([
  SetDrawingApplyMutation.id, InsertSheetsChartMutation.id, RemoveSheetsChartMutation.id,
  ChartUpdateConfigMutation.id, ChartUpdateSourceConfigMutation.id,
]);

/** Structural commands that would move or reshape the fixed template layout. */
const BLOCKED_COMMAND = /(insert|remove|delete)-(row|col|range|multi|sheet)|move-(range|rows|cols)|copy-sheet|set-worksheet-(name|order|hide)|add-worksheet-merge|remove-worksheet-merge|sort-range|insert-sheet|remove-sheet|set-worksheet-row-count|set-worksheet-column-count/;

/**
 * Display-only presentation for the editor: wider label column and visibly
 * marked input cells. Values, formulas, and layout are untouched (the template
 * validation only checks cell values and formulas).
 */
function decorate(workbook: BakeryWorkbook, availableWidth: number): BakeryWorkbook {
  const sheet = workbook.sheets?.[BAKERY_SHEET_ID] as (BakeryWorkbook['sheets'][string] & {
    columnData?: Record<string, { w?: number }>;
  }) | undefined;
  if (!sheet) return workbook;
  // Leave space below the protected model for charts, including on older saved workbooks.
  sheet.rowCount = Math.max(40, Number(sheet.rowCount) || 0);
  // Fit labels (A) and values (B) to the visible width, so the numbers never sit
  // off-screen on a phone. 46px is the row-number header; 22px leaves room for the scrollbar.
  const colB = !availableWidth || availableWidth >= 520 ? 150 : availableWidth < 400 ? 84 : 110;
  const colA = availableWidth ? Math.max(130, Math.min(230, availableWidth - 46 - colB - 22)) : 230;
  sheet.columnData = { ...(sheet.columnData ?? {}), 0: { w: colA }, 1: { w: colB } };
  const cells = sheet.cellData ?? {};
  for (const m of BAKERY_INPUTS) {
    const cell = cells[m.row]?.[m.col];
    if (cell && cell.s === undefined) cell.s = { bg: { rgb: '#EAF2FC' }, cl: { rgb: '#123F75' } };
  }
  const title = cells[0]?.[0];
  if (title && title.s === undefined) title.s = { bl: 1 };
  for (const row of [10, 13, 14]) {
    const label = cells[row]?.[0];
    if (label && label.s === undefined) label.s = { bl: 1 };
  }
  return workbook;
}

/** Univer writes formula results back with the same mutation as user edits; those are not edits. */
function isFormulaResultWrite(options?: IExecutionOptions): boolean {
  const o = options as (IExecutionOptions & { fromFormula?: boolean; applyFormulaCalculationResult?: boolean }) | undefined;
  return Boolean(o?.fromFormula || o?.applyFormulaCalculationResult);
}

export interface BrowserAdapterOptions {
  container: HTMLElement;
  /** A separate report viewer preserves its layout and never accepts edits. */
  report?: boolean;
  /** Contents of UNIVER_LICENSE (license.txt). Only this value reaches the browser. */
  license?: string;
}

export type BlockedEditListener = (message: string) => void;
export type SelectionListener = (cell: { row: number; col: number }) => void;

interface ISetRangeValuesParams {
  unitId: string;
  subUnitId: string;
  cellValue?: Record<string, Record<string, Record<string, unknown> | null | undefined>>;
}

interface ISelectionParams {
  unitId: string;
  subUnitId: string;
  selections?: { range?: { startRow: number; startColumn: number } }[];
}

interface InjectorAccess {
  __getInjector(): { get<T>(token: unknown): T };
}

export class BrowserWorkbookAdapter implements IWorkbookAdapter {
  private readonly univer: Univer;
  private readonly api: FUniver;
  private readonly container: HTMLElement;
  private readonly commands: ICommandService;
  private readonly instances: IUniverInstanceService;
  private readonly session: FormulaCalculationSessionService;
  private readonly disposables: IDisposable[] = [];
  private readonly changeListeners = new Set<() => void>();
  private readonly calculatedListeners = new Set<() => void>();
  private readonly blockedListeners = new Set<BlockedEditListener>();
  private readonly selectionListeners = new Set<SelectionListener>();
  private unit: Workbook | null = null;
  private loading = false;
  private readOnly = false;
  private disposed = false;
  private readonly report: boolean;

  constructor(options: BrowserAdapterOptions) {
    this.container = options.container;
    this.report = Boolean(options.report);
    this.readOnly = this.report;
    this.univer = new Univer({
      theme: defaultTheme,
      locale: LocaleType.EN_US,
      logLevel: LogLevel.WARN,
      locales: {
        [LocaleType.EN_US]: mergeLocales(
          DesignEnUS, UIEnUS, DocsUIEnUS, SheetsEnUS, SheetsUIEnUS, SheetsFormulaEnUS, SheetsFormulaUIEnUS,
          DrawingUIEnUS, SheetsDrawingUIEnUS, EngineChartEnUS, ChartUIEnUS, SheetsChartEnUS, SheetsChartUIEnUS, SheetsPrintEnUS,
        ),
      },
    });
    if (options.license && options.license.trim()) {
      this.univer.registerPlugin(UniverLicensePlugin, { license: options.license });
    }
    this.univer.registerPlugin(UniverRenderEnginePlugin);
    this.univer.registerPlugin(UniverFormulaEnginePlugin);
    this.univer.registerPlugin(UniverUIPlugin, {
      container: options.container,
      header: true,
      toolbar: false,
      footer: false,
      contextMenu: false,
      headerMenu: false,
    });
    this.univer.registerPlugin(UniverDocsPlugin);
    this.univer.registerPlugin(UniverDocsUIPlugin);
    this.univer.registerPlugin(UniverSheetsPlugin);
    this.univer.registerPlugin(UniverSheetsUIPlugin, { formulaBar: true, footer: false });
    this.univer.registerPlugin(UniverSheetsFormulaPlugin);
    this.univer.registerPlugin(UniverSheetsFormulaUIPlugin);
    this.univer.registerPlugin(UniverDrawingPlugin);
    this.univer.registerPlugin(UniverDrawingUIPlugin);
    this.univer.registerPlugin(UniverSheetsDrawingPlugin);
    this.univer.registerPlugin(UniverSheetsDrawingUIPlugin);
    this.univer.registerPlugin(UniverSheetsChartPlugin);
    this.univer.registerPlugin(UniverSheetsChartUIPlugin, { enableChartElementFloatMenu: false });
    this.univer.registerPlugin(UniverSheetsPrintPlugin);
    this.api = FUniver.newAPI(this.univer);

    const injector = (this.univer as unknown as InjectorAccess).__getInjector();
    this.commands = injector.get<ICommandService>(ICommandService);
    this.instances = injector.get<IUniverInstanceService>(IUniverInstanceService);
    this.session = injector.get<FormulaCalculationSessionService>(FormulaCalculationSessionService);

    this.disposables.push(this.commands.beforeCommandExecuted((info, options) => this.guard(info, options)));
    this.disposables.push(
      this.commands.onCommandExecuted((info, options) => {
        if (this.loading || !this.unit || isFormulaResultWrite(options)) return;
        const params = info.params as { unitId?: string } | undefined;
        if ((info.id === SetRangeValuesMutation.id && params?.unitId === this.unit.getUnitId()) || CHART_MUTATIONS.has(info.id)) {
          this.changeListeners.forEach((l) => l());
        } else if (info.id === 'sheet.operation.set-selections') {
          const sel = (info.params as ISelectionParams | undefined)?.selections?.[0]?.range;
          if (sel) this.selectionListeners.forEach((l) => l({ row: sel.startRow, col: sel.startColumn }));
        }
      }),
    );
    const sub = this.session.resultApplied$.subscribe(() => {
      if (!this.loading) this.calculatedListeners.forEach((l) => l());
    });
    this.disposables.push({ dispose: () => sub.unsubscribe() });
  }

  /** Block edits outside the input cells, formulas in input cells, and layout changes. */
  private guard(info: ICommandInfo, options?: IExecutionOptions): void {
    if (this.loading || !this.unit || isFormulaResultWrite(options)) return;
    if (this.readOnly && CHART_MUTATIONS.has(info.id)) {
      this.block(this.report ? 'This report is read-only.' : 'This baseline is read-only because other scenarios are compared against it.');
    }
    if (info.type === CommandType.COMMAND && BLOCKED_COMMAND.test(info.id)) {
      this.block('The bakery layout is fixed in this version. Only the input cells B2:B9 can be edited.');
    }
    if (info.id !== SetRangeValuesMutation.id) return;
    const params = info.params as ISetRangeValuesParams | undefined;
    if (!params || params.unitId !== this.unit.getUnitId()) return;
    if (this.readOnly) {
      this.block(this.report ? 'This report is read-only.' : 'This baseline is read-only because other scenarios are compared against it.');
    }
    for (const [row, cols] of Object.entries(params.cellValue ?? {})) {
      for (const [col, cell] of Object.entries(cols ?? {})) {
        if (!INPUT_POSITIONS.has(`${row}:${col}`)) {
          this.block('Labels and formula cells are fixed. Only the input cells B2:B9 can be edited.');
        }
        if (cell && ((typeof cell.f === 'string' && cell.f) || (typeof cell.si === 'string' && cell.si))) {
          this.block('Input cells take numbers, not formulas.');
        }
      }
    }
  }

  private block(message: string): never {
    this.blockedListeners.forEach((l) => l(message));
    throw new CustomCommandExecutionError(message);
  }

  async load(workbook: unknown): Promise<void> {
    this.loading = true;
    try {
      if (this.unit) {
        this.instances.disposeUnit(this.unit.getUnitId());
        this.unit = null;
      }
      const copy = structuredClone(workbook) as BakeryWorkbook;
      const data = (this.report ? copy : decorate(copy, this.container.clientWidth)) as unknown as Partial<IWorkbookData>;
      this.unit = this.univer.createUnit<Partial<IWorkbookData>, Workbook>(UniverInstanceType.UNIVER_SHEET, data);
      await this.commands.executeCommand(
        SetTriggerFormulaCalculationStartMutation.id,
        { commands: [], forceCalculation: true },
        { onlyLocal: true },
      );
      await this.waitForRecalculation();
      // Presentation-only fit for charts saved on a wider screen; input values and sources stay unchanged.
      const chartWidth = Math.max(240, Math.min(580, this.container.clientWidth - 70));
      if (!this.report) for (const chart of this.api.getActiveWorkbook()?.getActiveSheet().getCharts() ?? []) chart.setSize(chartWidth, 290);
    } finally {
      this.loading = false;
    }
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnly = this.report || readOnly;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposables.forEach((d) => d.dispose());
    this.changeListeners.clear();
    this.calculatedListeners.clear();
    this.blockedListeners.clear();
    this.selectionListeners.clear();
    this.univer.dispose();
  }

  private snapshot(): BakeryWorkbook {
    if (!this.unit) throw new Error('No workbook loaded.');
    const snap = this.api.getWorkbook(this.unit.getUnitId())!.save() as unknown as BakeryWorkbook;
    if (!this.report) snap.sheetOrder = [BAKERY_SHEET_ID];
    return snap;
  }

  getInput(key: BakeryInputKey): number | null {
    const mapping = BAKERY_INPUTS.find((m) => m.key === key);
    if (!mapping || !this.unit) return null;
    const sheet = this.unit.getSheetBySheetId(BAKERY_SHEET_ID);
    const value = sheet?.getCellRaw(mapping.row, mapping.col)?.v;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  /** Raw value in an input cell (may be text the user typed), for validation messages. */
  getRawInput(key: BakeryInputKey): unknown {
    const mapping = BAKERY_INPUTS.find((m) => m.key === key);
    if (!mapping || !this.unit) return undefined;
    return this.unit.getSheetBySheetId(BAKERY_SHEET_ID)?.getCellRaw(mapping.row, mapping.col)?.v;
  }

  async setInput(key: BakeryInputKey, value: number): Promise<void> {
    await this.setInputs({ [key]: value });
  }

  /** Write several inputs into their cells, then wait for Univer to recalculate. */
  async setInputs(values: Partial<Record<BakeryInputKey, number>>): Promise<void> {
    if (!this.unit) throw new Error('No workbook loaded.');
    if (this.readOnly) throw new Error('This scenario is read-only.');
    for (const [key, value] of Object.entries(values)) {
      const mapping = BAKERY_INPUTS.find((m) => m.key === key);
      if (!mapping || value === undefined) continue;
      const ok = await this.commands.executeCommand(SetRangeValuesCommand.id, {
        unitId: this.unit.getUnitId(),
        subUnitId: BAKERY_SHEET_ID,
        range: { startRow: mapping.row, endRow: mapping.row, startColumn: mapping.col, endColumn: mapping.col },
        value: { v: value, t: NUMBER_TYPE },
      });
      if (!ok) throw new Error(`Could not update ${mapping.label}.`);
    }
    await this.waitForRecalculation();
  }

  async waitForRecalculation(): Promise<void> {
    try {
      await this.session.waitForLatestApplied(RECALC_TIMEOUT_MS);
    } catch {
      throw new Error('The spreadsheet did not finish calculating in time.');
    }
  }

  readProjection(): BakeryProjection {
    return readBakeryProjection(this.snapshot());
  }

  exportSnapshot(): BakeryWorkbook {
    return this.snapshot();
  }

  getChartCount(): number {
    return this.api.getActiveWorkbook()?.getActiveSheet().getCharts().length ?? 0;
  }

  /** A live chart of fixed monthly overheads; ingredient costs remain in the separate per-unit input. */
  async addOverheadChart(): Promise<void> {
    if (this.readOnly) throw new Error('This baseline is read-only. Add a chart to a shock or response instead.');
    const sheet = this.api.getActiveWorkbook()?.getActiveSheet();
    if (!sheet) throw new Error('No workbook loaded.');
    if (sheet.getCharts().length >= MAX_SCENARIO_CHARTS) throw new Error(`Use at most ${MAX_SCENARIO_CHARTS} charts per scenario.`);
    const info = sheet.newChart(this.api.Enum.ChartTypeString.Bar)
      .setSource({ range: 'A5:B9', orientation: this.api.Enum.ChartSourceOrientation.Columns, header: {} })
      .setCategoryField(0)
      .setValueFields([1])
      .setPosition('A19')
      .setSize(Math.max(240, Math.min(580, this.container.clientWidth - 70)), 290)
      .setTitle('Monthly overheads')
      .setLegend({ visible: false })
      .build();
    await sheet.insertChart(info);
    sheet.scrollToCell(17, 0, 0);
  }

  showChart(): void {
    this.api.getActiveWorkbook()?.getActiveSheet().scrollToCell(17, 0, 0);
  }

  showInputs(): void {
    this.api.getActiveWorkbook()?.getActiveSheet().scrollToCell(0, 0, 0);
  }

  async printScenario(): Promise<void> {
    await this.waitForRecalculation();
    const workbook = this.api.getActiveWorkbook();
    if (!workbook) throw new Error('No workbook loaded.');
    // In 1.4.0 openPrintDialog uses syncExecuteCommand for an async operation.
    // Use the exported operation through the async command API so errors are awaited correctly.
    const opened = await this.commands.executeCommand(SheetPrintOpenOperation.id);
    if (!opened) throw new Error('Print preview could not open. Please try again.');
    if (this.report) {
      const manager = (this.univer as unknown as InjectorAccess).__getInjector().get<ISheetPrintManagerService>(ISheetPrintManagerService);
      manager.updateLayoutConfig({
        area: this.api.Enum.PrintArea.CurrentSheet,
        subUnitIds: [workbook.getActiveSheet().getSheetId()],
        paperSize: this.api.Enum.PrintPaperSize.A4,
        direction: this.api.Enum.PrintDirection.Landscape,
        scale: this.api.Enum.PrintScale.FitWidth,
      });
      manager.updateRenderConfig({ gridlines: false });
    }
  }

  inspectResult(key: BakeryResultKey): ResultInspection {
    const projection = this.readProjection();
    const inspected = inspectFromProjection(key, projection);
    return {
      key,
      cell: inspected.cell,
      label: inspected.label,
      formula: inspected.formula,
      contributingInputs: inspected.contributingInputs.map((c) => ({
        key: c.key as BakeryInputKey,
        cell: c.cell,
        label: c.label,
        value: c.value,
      })),
    };
  }

  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Fires after Univer applies a calculation result (the projection is current). */
  onCalculated(listener: () => void): () => void {
    this.calculatedListeners.add(listener);
    return () => this.calculatedListeners.delete(listener);
  }

  onBlockedEdit(listener: BlockedEditListener): () => void {
    this.blockedListeners.add(listener);
    return () => this.blockedListeners.delete(listener);
  }

  onSelect(listener: SelectionListener): () => void {
    this.selectionListeners.add(listener);
    return () => this.selectionListeners.delete(listener);
  }
}
