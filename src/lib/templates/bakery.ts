/**
 * Bakery template `bakery-v1`.
 *
 * The single source of truth for the cell layout shared by the browser editor,
 * the server calculation adapter, and the validation rules in
 * docs/API_CONTRACT.md. Column A holds human-readable labels, column B holds
 * values or formulas. Cell references below are A1 notation; row/col fields are
 * 0-based indices into ICellData matrices.
 */

export const BAKERY_TEMPLATE_ID = 'bakery-v1';
export const BAKERY_TEMPLATE_VERSION = 1;
export const BAKERY_SHEET_ID = 'model';
export const BAKERY_TITLE = 'Bakery — monthly model';

export const BAKERY_INPUT_KEYS = [
  'monthlyUnits',
  'unitPrice',
  'ingredientCostPerUnit',
  'monthlyEnergy',
  'monthlyRent',
  'monthlyWages',
  'monthlyOtherCosts',
  'monthlyDelivery',
] as const;

export type BakeryInputKey = (typeof BAKERY_INPUT_KEYS)[number];

export const BAKERY_RESULT_KEYS = [
  'revenue',
  'ingredientCosts',
  'fixedCosts',
  'totalCosts',
  'profit',
  'marginFraction',
] as const;

export type BakeryResultKey = (typeof BAKERY_RESULT_KEYS)[number];

export interface BakeryCellMapping {
  key: string;
  /** A1 notation, e.g. "B2". */
  cell: string;
  /** 0-based row index. */
  row: number;
  /** 0-based column index. */
  col: number;
  label: string;
}

export interface BakeryResultMapping extends BakeryCellMapping {
  /** Exact formula text the template requires; any deviation is rejected. */
  formula: string;
}

export const BAKERY_INPUTS: readonly BakeryCellMapping[] = [
  { key: 'monthlyUnits', cell: 'B2', row: 1, col: 1, label: 'Units sold per month' },
  { key: 'unitPrice', cell: 'B3', row: 2, col: 1, label: 'Price per unit' },
  { key: 'ingredientCostPerUnit', cell: 'B4', row: 3, col: 1, label: 'Ingredient cost per unit' },
  { key: 'monthlyEnergy', cell: 'B5', row: 4, col: 1, label: 'Monthly energy expense' },
  { key: 'monthlyRent', cell: 'B6', row: 5, col: 1, label: 'Monthly rent' },
  { key: 'monthlyWages', cell: 'B7', row: 6, col: 1, label: 'Monthly wages' },
  { key: 'monthlyOtherCosts', cell: 'B8', row: 7, col: 1, label: 'Other monthly expenses' },
  { key: 'monthlyDelivery', cell: 'B9', row: 8, col: 1, label: 'Monthly supplier delivery cost' },
];

export const BAKERY_RESULTS: readonly BakeryResultMapping[] = [
  { key: 'revenue', cell: 'B11', row: 10, col: 1, label: 'Revenue', formula: '=B2*B3' },
  { key: 'ingredientCosts', cell: 'B12', row: 11, col: 1, label: 'Ingredient costs', formula: '=B2*B4' },
  { key: 'fixedCosts', cell: 'B13', row: 12, col: 1, label: 'Fixed costs', formula: '=SUM(B5:B9)' },
  { key: 'totalCosts', cell: 'B14', row: 13, col: 1, label: 'Total costs', formula: '=B12+B13' },
  { key: 'profit', cell: 'B15', row: 14, col: 1, label: 'Profit', formula: '=B11-B14' },
  { key: 'marginFraction', cell: 'B16', row: 15, col: 1, label: 'Profit margin', formula: '=IF(B11=0,"",B15/B11)' },
];

/** Fictional demo figures from docs/API_CONTRACT.md. Demo data is labelled, never real. */
export const BAKERY_DEMO_INPUTS: Record<BakeryInputKey, number> = {
  monthlyUnits: 1000,
  unitPrice: 5,
  ingredientCostPerUnit: 2,
  monthlyEnergy: 400,
  monthlyRent: 600,
  monthlyWages: 1200,
  monthlyOtherCosts: 100,
  monthlyDelivery: 0,
};

/** Blank template starts at zero with nothing inferred. */
export const BAKERY_BLANK_INPUTS: Record<BakeryInputKey, number> = {
  monthlyUnits: 0,
  unitPrice: 0,
  ingredientCostPerUnit: 0,
  monthlyEnergy: 0,
  monthlyRent: 0,
  monthlyWages: 0,
  monthlyOtherCosts: 0,
  monthlyDelivery: 0,
};

/**
 * Which template inputs feed each result cell, derived from the formulas above.
 * The inspect panel uses this to show a result's formula and contributing
 * inputs without general dependency analysis.
 */
export const BAKERY_RESULT_INPUTS: Record<BakeryResultKey, readonly BakeryInputKey[]> = {
  revenue: ['monthlyUnits', 'unitPrice'],
  ingredientCosts: ['monthlyUnits', 'ingredientCostPerUnit'],
  fixedCosts: ['monthlyEnergy', 'monthlyRent', 'monthlyWages', 'monthlyOtherCosts', 'monthlyDelivery'],
  totalCosts: [
    'monthlyUnits',
    'ingredientCostPerUnit',
    'monthlyEnergy',
    'monthlyRent',
    'monthlyWages',
    'monthlyOtherCosts',
    'monthlyDelivery',
  ],
  profit: [
    'monthlyUnits',
    'unitPrice',
    'ingredientCostPerUnit',
    'monthlyEnergy',
    'monthlyRent',
    'monthlyWages',
    'monthlyOtherCosts',
    'monthlyDelivery',
  ],
  marginFraction: [
    'monthlyUnits',
    'unitPrice',
    'ingredientCostPerUnit',
    'monthlyEnergy',
    'monthlyRent',
    'monthlyWages',
    'monthlyOtherCosts',
    'monthlyDelivery',
  ],
};

/** Template simplifications shown to users, per docs/BUILD_BRIEF.md. */
export const BAKERY_SIMPLIFICATIONS = [
  'All costs are monthly except ingredient cost per unit.',
  'The template models one product and assumes all entered units are sold.',
  'Energy, rent, wages, other expenses, and delivery are independent monthly inputs.',
  'Waste, tax, financing, seasonality, and energy changes caused by production volume are not modelled.',
];

export const BAKERY_TEMPLATE_NAME = 'Bakery';

export const BAKERY_TEMPLATE_DESCRIPTION =
  'A single-product bakery with monthly costs and an ingredient cost per unit. ' +
  'Edit the eight input cells in column B; revenue, costs, profit, and margin are formulas. ' +
  'A price change never invents a demand response — you must enter or confirm expected monthly sales. ' +
  BAKERY_SIMPLIFICATIONS.join(' ');

/**
 * Build the full Univer workbook snapshot for this template. Pure data: no Univer
 * imports, so the browser and the server build identical shapes.
 */
export function buildBakeryWorkbook(
  inputs: Record<BakeryInputKey, number>,
  workbookId: string,
): Record<string, unknown> {
  const cellData: Record<number, Record<number, Record<string, unknown>>> = {};
  const put = (row: number, col: number, data: Record<string, unknown>) => {
    cellData[row] = cellData[row] ?? {};
    cellData[row][col] = data;
  };

  put(0, 0, { v: BAKERY_TITLE });

  for (const input of BAKERY_INPUTS) {
    put(input.row, 0, { v: input.label });
    put(input.row, input.col, { v: inputs[input.key as BakeryInputKey] });
  }

  for (const result of BAKERY_RESULTS) {
    put(result.row, 0, { v: result.label });
    put(result.row, result.col, { f: result.formula });
  }

  return {
    id: workbookId,
    name: 'Bakery model',
    sheetOrder: [BAKERY_SHEET_ID],
    sheets: {
      [BAKERY_SHEET_ID]: {
        id: BAKERY_SHEET_ID,
        name: 'model',
        rowCount: 20,
        columnCount: 4,
        cellData,
      },
    },
  };
}
