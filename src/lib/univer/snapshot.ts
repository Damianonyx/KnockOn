/**
 * Workbook snapshot validation shared by browser and server.
 *
 * The bakery template is the only accepted workbook shape in this milestone.
 * These checks run before calculation or persistence: dimensions, expected
 * input/result mappings, formula cells, and finite numeric input types.
 * Formula cells and template layout are not user-editable; attempted changes
 * are rejected here even if browser protection was bypassed.
 *
 * This module is intentionally free of Univer imports so it can run in the
 * browser bundle and in route handlers alike.
 */
import {
  BAKERY_INPUTS,
  BAKERY_RESULTS,
  BAKERY_SHEET_ID,
} from '@/lib/templates/bakery';

/** Minimal structural mirror of Univer's ICellData (what the template uses). */
export interface BakeryCellData {
  v?: unknown;
  t?: number;
  f?: string | null;
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
  id?: unknown;
  sheetOrder?: unknown;
  sheets?: Record<string, BakerySheetData>;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate a submitted workbook snapshot against the bakery template.
 * Returns the narrowed workbook on success, or every issue found so the UI can
 * point at the exact cells.
 */
export function validateBakerySnapshot(input: unknown): SnapshotValidation {
  const issues: SnapshotIssue[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ field: 'workbook', message: 'Workbook snapshot must be an object.' }] };
  }
  const workbook = input as BakeryWorkbook;

  if (typeof workbook.id !== 'string' || workbook.id.length === 0) {
    issues.push({ field: 'workbook.id', message: 'Workbook must carry a string id.' });
  }
  if (!isPlainObject(workbook.sheets)) {
    return {
      ok: false,
      issues: [...issues, { field: 'workbook.sheets', message: 'Workbook must contain a sheets map.' }],
    };
  }
  const sheet = workbook.sheets[BAKERY_SHEET_ID];
  if (!isPlainObject(sheet)) {
    return {
      ok: false,
      issues: [...issues, { field: `workbook.sheets.${BAKERY_SHEET_ID}`, message: `Worksheet "${BAKERY_SHEET_ID}" is required.` }],
    };
  }
  const cellData = isPlainObject(sheet.cellData) ? sheet.cellData : {};

  // Dimensions: the bakery template occupies exactly A1:B16 (rows 0-15, cols 0-1).
  for (const [rowKey, row] of Object.entries(cellData)) {
    const rowIdx = Number(rowKey);
    if (!Number.isInteger(rowIdx) || rowIdx < 0 || rowIdx > 15) {
      issues.push({ field: `workbook.row:${rowKey}`, message: 'Row is outside the bakery template layout.' });
      continue;
    }
    if (!isPlainObject(row)) {
      issues.push({ field: `workbook.row:${rowKey}`, message: 'Row must be a column map.' });
      continue;
    }
    for (const colKey of Object.keys(row)) {
      const colIdx = Number(colKey);
      if (!Number.isInteger(colIdx) || colIdx < 0 || colIdx > 1) {
        issues.push({
          field: `workbook.${rowIdx}:${colKey}`,
          message: 'Cell is outside the bakery template layout (columns A and B only).',
        });
      }
    }
  }

  // Labels in column A keep the template readable and pin the layout.
  for (const mapping of [...BAKERY_INPUTS, ...BAKERY_RESULTS]) {
    const labelCell = cellData[mapping.row]?.[0];
    const labelValue = labelCell?.v;
    if (typeof labelValue !== 'string' || labelValue !== mapping.label) {
      issues.push({
        field: `workbook.A${mapping.row + 1}`,
        message: `Template label mismatch: expected "${mapping.label}" in ${mapping.cell === 'B2' ? 'A' : 'A'}${mapping.row + 1}.`,
      });
    }
  }

  // Inputs: finite, nonnegative numbers. Zero is valid; blank is not.
  for (const mapping of BAKERY_INPUTS) {
    const cell = cellData[mapping.row]?.[mapping.col];
    const value = cell?.v;
    if (value === undefined || value === null || value === '') {
      issues.push({
        field: `workbook.${mapping.cell}`,
        message: `"${mapping.label}" is required. Enter a number; zero is valid but blank is not.`,
      });
    } else if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.push({
        field: `workbook.${mapping.cell}`,
        message: `"${mapping.label}" must be a finite number.`,
      });
    } else if (value < 0) {
      issues.push({
        field: `workbook.${mapping.cell}`,
        message: `"${mapping.label}" must be zero or positive.`,
      });
    }
  }

  // Formula cells: exact template formulas. Any other formula is a rejected edit.
  for (const mapping of BAKERY_RESULTS) {
    const cell = cellData[mapping.row]?.[mapping.col];
    if (cell?.f !== mapping.formula) {
      issues.push({
        field: `workbook.${mapping.cell}`,
        message: `Formula cells are fixed by the template. "${mapping.cell}" must stay "${mapping.formula}".`,
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, workbook };
}

/** Read one cell's raw data from a validated workbook. */
export function readBakeryCell(
  workbook: BakeryWorkbook,
  row: number,
  col: number,
): BakeryCellData | undefined {
  const sheet = workbook.sheets?.[BAKERY_SHEET_ID];
  const cellData = sheet && isPlainObject(sheet.cellData) ? sheet.cellData : {};
  const cell = cellData[row]?.[col];
  return isPlainObject(cell) ? (cell as BakeryCellData) : undefined;
}
