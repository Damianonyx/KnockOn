import { z } from 'zod';
import type { ScenarioKind } from './project';
import type { BakeryInputKey } from '@/lib/templates/bakery';

export const analysisRequestSchema = z.object({
  expectedRevision: z.number().int().min(1),
  minUnits: z.number().int().min(0).max(1_000_000_000),
  maxUnits: z.number().int().min(1).max(1_000_000_000),
}).refine((r) => r.maxUnits > r.minUnits, { path: ['maxUnits'], message: 'Maximum sales must be greater than minimum sales.' });
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;

export interface SensitivityPoint {
  units: number;
  revenue: number;
  totalCosts: number;
  profit: number;
  /** Row in this scenario's temporary analysis sheet, for inspecting formulas. */
  row: number;
}

export interface ScenarioAnalysis {
  scenarioId: string;
  name: string;
  kind: ScenarioKind;
  inputs: Record<BakeryInputKey, number>;
  fixedCosts: number;
  contributionPerUnit: number;
  breakEvenUnits: number | null;
  breakEvenStatus: 'attainable' | 'any-volume' | 'zero-sales-only' | 'unreachable';
  points: SensitivityPoint[];
}

export interface ProjectAnalysis {
  projectId: string;
  projectRevision: number;
  minUnits: number;
  maxUnits: number;
  scenarios: ScenarioAnalysis[];
}

/**
 * These cells live in a separate analysis sheet; the saved model stays A1:B16.
 *
 * The two ROUND calls keep binary floating-point noise from adding a unit. Without
 * them, 4.35 - 4.05 is 0.2999999999999998 in Univer (as in any spreadsheet), so
 * 15 / 0.2999999999999998 = 50.00000000000003 would round up to 51 when exactly
 * 50 units cover the costs. A quotient within a millionth of a whole unit is
 * treated as that whole unit.
 */
export const BREAK_EVEN_FORMULAS = {
  B13: '=SUM(B5:B9)',
  B18: '=ROUND(B3-B4,9)',
  B19: '=IF(B18>0,ROUNDUP(ROUND(B13/B18,6),0),IF(B13=0,0,""))',
} as const;

export const sensitivityFormulas = (row: number) => ({
  revenue: `=A${row}*$B$3`,
  totalCosts: `=A${row}*$B$4+$B$13`,
  profit: `=B${row}-C${row}`,
});
