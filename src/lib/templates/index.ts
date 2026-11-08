/**
 * Template registry. The first milestone accepts exactly one workbook shape,
 * `bakery-v1`. Adding a template means adding its mappings here plus server
 * validation for its sheet id and cells.
 */
import {
  BAKERY_INPUTS,
  BAKERY_RESULTS,
  BAKERY_RESULT_INPUTS,
  BAKERY_SHEET_ID,
  BAKERY_SIMPLIFICATIONS,
  BAKERY_TEMPLATE_DESCRIPTION,
  BAKERY_TEMPLATE_ID,
  BAKERY_TEMPLATE_NAME,
  BAKERY_TEMPLATE_VERSION,
  type BakeryResultKey,
} from './bakery';

export interface TemplateInputDescriptor {
  key: string;
  cell: string;
  label: string;
  /** Column A cell holding the label, e.g. "A2". */
  labelCell: string;
}

export interface TemplateResultDescriptor {
  key: string;
  cell: string;
  label: string;
  formula: string;
  /** Input keys that feed this result, for the inspect panel. */
  inputs: string[];
}

export interface TemplateDescriptor {
  id: string;
  version: number;
  name: string;
  description: string;
  simplifications: string[];
  sheetId: string;
  inputs: TemplateInputDescriptor[];
  results: TemplateResultDescriptor[];
}

export const BAKERY_TEMPLATE: TemplateDescriptor = {
  id: BAKERY_TEMPLATE_ID,
  version: BAKERY_TEMPLATE_VERSION,
  name: BAKERY_TEMPLATE_NAME,
  description: BAKERY_TEMPLATE_DESCRIPTION,
  simplifications: [...BAKERY_SIMPLIFICATIONS],
  sheetId: BAKERY_SHEET_ID,
  inputs: BAKERY_INPUTS.map((i) => ({
    key: i.key,
    cell: i.cell,
    label: i.label,
    labelCell: `A${i.row + 1}`,
  })),
  results: BAKERY_RESULTS.map((r) => ({
    key: r.key,
    cell: r.cell,
    label: r.label,
    formula: r.formula,
    inputs: [...BAKERY_RESULT_INPUTS[r.key as BakeryResultKey]],
  })),
};

export const TEMPLATES: readonly TemplateDescriptor[] = [BAKERY_TEMPLATE];

export function getTemplate(id: string): TemplateDescriptor | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export { BAKERY_TEMPLATE_ID } from './bakery';
