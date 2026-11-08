/**
 * Projection reader: turns a *recalculated* bakery workbook snapshot into the
 * inputs/metrics projection the UI consumes.
 *
 * This only reads values that Univer's formula engine already wrote into the
 * snapshot. It is not a second calculation engine; the arithmetic happens in
 * Univer on the server (docs/BUILD_BRIEF.md, "Calculation rules").
 */
import type { CalculationError } from '@/lib/contracts/project';
import { BAKERY_INPUTS, BAKERY_RESULTS, type BakeryInputKey, type BakeryResultKey } from '@/lib/templates/bakery';
import { readBakeryCell, type BakeryWorkbook } from './snapshot';

/**
 * Excel-style formula error literals emitted by Univer's engine
 * (@univerjs/engine-formula ErrorType, v1.4.0). #GETTING_DATA is excluded: it
 * is a loading state, not a result.
 */
export const FORMULA_ERROR_LITERALS: readonly string[] = [
  '#DIV/0!',
  '#NAME?',
  '#VALUE!',
  '#NUM!',
  '#N/A',
  '#CYCLE!',
  '#REF!',
  '#SPILL!',
  '#CALC!',
  '#ERROR!',
  '#NULL!',
];

export function isFormulaErrorLiteral(value: unknown): value is string {
  return typeof value === 'string' && (FORMULA_ERROR_LITERALS as readonly string[]).includes(value);
}

export interface BakeryProjection {
  inputs: Record<BakeryInputKey, number>;
  metrics: Record<BakeryResultKey, number | null>;
  /** Formula cells that evaluated to an error literal, with their A1 reference. */
  errors: CalculationError[];
}

/**
 * Read inputs and metrics from a recalculated snapshot. A blank margin result
 * (empty string) maps to null, per the API contract; negative profit stays a
 * valid negative number.
 */
export function readBakeryProjection(workbook: BakeryWorkbook): BakeryProjection {
  const inputs: Record<string, number> = {};
  const metrics: Record<string, number | null> = {};
  const errors: CalculationError[] = [];

  for (const mapping of BAKERY_INPUTS) {
    const value = readBakeryCell(workbook, mapping.row, mapping.col)?.v;
    inputs[mapping.key] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  for (const mapping of BAKERY_RESULTS) {
    const cell = readBakeryCell(workbook, mapping.row, mapping.col);
    const value = cell?.v;
    if (isFormulaErrorLiteral(value)) {
      errors.push({ cell: mapping.cell, message: `Formula error in ${mapping.cell}: ${value}` });
      metrics[mapping.key] = null;
    } else if (value === undefined || value === null || value === '') {
      // Blank calculated result (e.g. margin with zero revenue) is null, not zero.
      metrics[mapping.key] = null;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      metrics[mapping.key] = value;
    } else {
      errors.push({ cell: mapping.cell, message: `Non-numeric result in ${mapping.cell}: ${String(value)}` });
      metrics[mapping.key] = null;
    }
  }

  return { inputs: inputs as Record<BakeryInputKey, number>, metrics: metrics as Record<BakeryResultKey, number | null>, errors };
}
