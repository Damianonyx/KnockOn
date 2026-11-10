/**
 * Workbook snapshot validation shared by the browser and the server.
 *
 * The bakery template is the only accepted workbook shape in this milestone.
 * These checks run before calculation or persistence: layout, labels, input
 * values, and formula cells. Formula cells and layout are not user-editable;
 * attempted changes are rejected here even if browser protection was bypassed.
 *
 * No Univer imports, so this runs in the browser bundle and route handlers alike.
 */
import {
  BAKERY_INPUTS,
  BAKERY_RESULTS,
  BAKERY_SHEET_ID,
  BAKERY_TITLE,
} from '@/lib/templates/bakery';
import { validateChartResources } from './chart-resources';

/** Minimal structural mirror of Univer's ICellData (the parts the template uses). */
export interface BakeryCellData {
  v?: unknown;
  t?: number;
  f?: string | null;
  si?: string | null;
  [key: string]: unknown;
}

export type BakeryCellMatrix = Record<string, Record<string, BakeryCellData | undefined>>;

export interface BakerySheetData {
  id?: string;
  name?: string;
  cellData?: BakeryCellMatrix;
  [key: string]: unknown;
}

export interface BakeryWorkbook {
  id: string;
  sheetOrder?: string[];
  sheets: Record<string, BakerySheetData>;
  [key: string]: unknown;
}

export interface SnapshotIssue {
  /** Dot-path field for the API `fields` map, e.g. "workbook.B11". */
  field: string;
  message: string;
}

export type SnapshotValidation =
  | { ok: true; workbook: BakeryWorkbook }
  | { ok: false; issues: SnapshotIssue[] };

/** Last row (0-based) and column the template may occupy: A1:B16. */
const MAX_ROW = 15;
const MAX_COL = 1;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function a1(row: number, col: number): string {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

function hasContent(cell: BakeryCellData | undefined): boolean {
  if (!cell) return false;
  const hasValue = cell.v !== undefined && cell.v !== null && cell.v !== '';
  const hasFormula = typeof cell.f === 'string' && cell.f.length > 0;
  const hasSharedFormula = typeof cell.si === 'string' && cell.si.length > 0;
  return hasValue || hasFormula || hasSharedFormula || cell.p !== undefined;
}

function hasFormula(cell: BakeryCellData | undefined): boolean {
  return Boolean(cell && ((typeof cell.f === 'string' && cell.f.length > 0) || (typeof cell.si === 'string' && cell.si.length > 0)));
}

/** Cells that may hold content, keyed "row:col", with the text a label cell must hold. */
const LABEL_CELLS = new Map<string, string>([
  ['0:0', BAKERY_TITLE],
  ...[...BAKERY_INPUTS, ...BAKERY_RESULTS].map((m) => [`${m.row}:0`, m.label] as [string, string]),
]);
const INPUT_CELLS = new Set(BAKERY_INPUTS.map((m) => `${m.row}:${m.col}`));
const RESULT_CELLS = new Set(BAKERY_RESULTS.map((m) => `${m.row}:${m.col}`));

/**
 * Validate a submitted workbook snapshot against the bakery template.
 * Returns every issue found so the UI can point at the exact cells.
 */
export function validateBakerySnapshot(input: unknown): SnapshotValidation {
  const issues: SnapshotIssue[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ field: 'workbook', message: 'Workbook snapshot must be an object.' }] };
  }

  if (typeof input.id !== 'string' || input.id.length === 0) {
    issues.push({ field: 'workbook.id', message: 'Workbook must carry a string id.' });
  }
  if (!isPlainObject(input.sheets)) {
    return { ok: false, issues: [...issues, { field: 'workbook.sheets', message: 'Workbook must contain a sheets map.' }] };
  }

  const sheetIds = Object.keys(input.sheets);
  if (sheetIds.length !== 1 || sheetIds[0] !== BAKERY_SHEET_ID) {
    issues.push({
      field: 'workbook.sheets',
      message: `The bakery template has exactly one worksheet, "${BAKERY_SHEET_ID}". Adding or renaming sheets is not supported.`,
    });
  }
  // Univer may export an empty sheet order for a single-sheet workbook.
  const sheetOrderOk =
    input.sheetOrder === undefined ||
    (Array.isArray(input.sheetOrder) &&
      (input.sheetOrder.length === 0 || (input.sheetOrder.length === 1 && input.sheetOrder[0] === BAKERY_SHEET_ID)));
  if (!sheetOrderOk) {
    issues.push({ field: 'workbook.sheetOrder', message: `Sheet order must be ["${BAKERY_SHEET_ID}"].` });
  }

  const sheet = input.sheets[BAKERY_SHEET_ID];
  if (!isPlainObject(sheet)) {
    return {
      ok: false,
      issues: [...issues, { field: `workbook.sheets.${BAKERY_SHEET_ID}`, message: `Worksheet "${BAKERY_SHEET_ID}" is required.` }],
    };
  }
  const cellData: BakeryCellMatrix = isPlainObject(sheet.cellData) ? (sheet.cellData as BakeryCellMatrix) : {};

  // Layout: only the template's cells may hold content.
  for (const [rowKey, row] of Object.entries(cellData)) {
    const rowIdx = Number(rowKey);
    if (!isPlainObject(row)) {
      issues.push({ field: `workbook.row${rowKey}`, message: 'Each row must be a map of columns.' });
      continue;
    }
    for (const [colKey, cell] of Object.entries(row)) {
      const colIdx = Number(colKey);
      if (cell !== undefined && cell !== null && !isPlainObject(cell)) {
        issues.push({ field: `workbook.row${rowKey}.col${colKey}`, message: 'Each cell must be an object.' });
        continue;
      }
      const typedCell = (cell ?? undefined) as BakeryCellData | undefined;
      const validPosition =
        Number.isInteger(rowIdx) && Number.isInteger(colIdx) && rowIdx >= 0 && colIdx >= 0 && rowIdx <= MAX_ROW && colIdx <= MAX_COL;
      const key = `${rowIdx}:${colIdx}`;
      const allowed = validPosition && (LABEL_CELLS.has(key) || INPUT_CELLS.has(key) || RESULT_CELLS.has(key));
      if (!allowed && hasContent(typedCell)) {
        const where = validPosition ? a1(rowIdx, colIdx) : `row ${rowKey}, column ${colKey}`;
        issues.push({
          field: `workbook.${validPosition ? a1(rowIdx, colIdx) : `row${rowKey}.col${colKey}`}`,
          message: `${where} is outside the bakery template. Only the input cells B2:B9 can be edited.`,
        });
      }
    }
  }

  // Labels and title pin the layout.
  for (const [key, label] of LABEL_CELLS) {
    const [row, col] = key.split(':').map(Number);
    const cell = cellData[row]?.[col];
    if (cell?.v !== label || hasFormula(cell)) {
      issues.push({ field: `workbook.${a1(row, col)}`, message: `${a1(row, col)} must contain the template label "${label}".` });
    }
  }

  // Inputs: finite, nonnegative numbers. Zero is valid; blank is not. No formulas.
  for (const mapping of BAKERY_INPUTS) {
    const cell = cellData[mapping.row]?.[mapping.col];
    const value = cell?.v;
    if (hasFormula(cell)) {
      issues.push({ field: `workbook.${mapping.cell}`, message: `"${mapping.label}" must be a number, not a formula.` });
    } else if (value === undefined || value === null || value === '') {
      issues.push({
        field: `workbook.${mapping.cell}`,
        message: `"${mapping.label}" is required. Enter a number; zero is valid but blank is not.`,
      });
    } else if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.push({ field: `workbook.${mapping.cell}`, message: `"${mapping.label}" must be a number.` });
    } else if (value < 0) {
      issues.push({ field: `workbook.${mapping.cell}`, message: `"${mapping.label}" must be zero or more.` });
    }
  }

  // Formula cells: exactly the template formulas.
  for (const mapping of BAKERY_RESULTS) {
    const cell = cellData[mapping.row]?.[mapping.col];
    if (cell?.f !== mapping.formula || (typeof cell?.si === 'string' && cell.si.length > 0)) {
      issues.push({
        field: `workbook.${mapping.cell}`,
        message: `${mapping.cell} is a fixed formula cell and must stay ${mapping.formula}.`,
      });
    }
  }

  issues.push(...validateChartResources(input as unknown as BakeryWorkbook));
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, workbook: input as unknown as BakeryWorkbook };
}

/**
 * Deep copy of a validated workbook with every formula cell's cached result
 * removed. The server always recalculates; values sent by a client are never
 * trusted.
 */
export function withoutCachedResults(workbook: BakeryWorkbook): BakeryWorkbook {
  const copy = structuredClone(workbook);
  const cellData = copy.sheets[BAKERY_SHEET_ID]?.cellData ?? {};
  for (const row of Object.values(cellData)) {
    for (const cell of Object.values(row ?? {})) {
      if (cell && typeof cell.f === 'string' && cell.f.length > 0) {
        delete cell.v;
        delete cell.t;
      }
    }
  }
  return copy;
}

/** Read one cell's raw data from a workbook. */
export function readBakeryCell(workbook: BakeryWorkbook, row: number, col: number): BakeryCellData | undefined {
  const sheet = workbook.sheets?.[BAKERY_SHEET_ID];
  const cellData = sheet && isPlainObject(sheet.cellData) ? sheet.cellData : {};
  const cell = cellData[row]?.[col];
  return isPlainObject(cell) ? (cell as BakeryCellData) : undefined;
}

/** Read one input value by template key, or null when missing or not a number. */
export function readBakeryInput(workbook: BakeryWorkbook, key: string): number | null {
  const mapping = BAKERY_INPUTS.find((m) => m.key === key);
  if (!mapping) return null;
  const value = readBakeryCell(workbook, mapping.row, mapping.col)?.v;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
