import { BAKERY_SHEET_ID } from '@/lib/templates/bakery';
import type { BakeryWorkbook, SnapshotIssue } from './snapshot';

export const CHART_RESOURCE = 'SHEET_CHART_PLUGIN';
export const DRAWING_RESOURCE = 'SHEET_DRAWING_PLUGIN';
export const MAX_SCENARIO_CHARTS = 6;

type Resource = { name: string; data: string };
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Only charts are supported as worksheet drawings. Export must never fetch arbitrary images or attachments. */
export function validateChartResources(workbook: BakeryWorkbook): SnapshotIssue[] {
  const fail = (message: string): SnapshotIssue[] => [{ field: 'workbook.resources', message }];
  if (workbook.resources === undefined) return [];
  if (!Array.isArray(workbook.resources) || workbook.resources.length > 30) return fail('Invalid worksheet resources.');
  const seen = new Set<string>();
  let chartIds: string[] = [];
  let drawingIds: string[] = [];
  for (const resource of workbook.resources) {
    if (!record(resource) || typeof resource.name !== 'string' || typeof resource.data !== 'string' || seen.has(resource.name)) {
      return fail('Each worksheet resource must have a unique name and serialized data.');
    }
    seen.add(resource.name);
    if (![CHART_RESOURCE, DRAWING_RESOURCE].includes(resource.name)) continue;
    if (resource.data.length > 100_000) return fail('Chart data is too large.');
    let data: unknown;
    try { data = JSON.parse(resource.data); } catch { return fail('Chart data could not be read.'); }
    if (!record(data) || Object.keys(data).some((id) => id !== BAKERY_SHEET_ID)) return fail('Charts must belong to this worksheet.');
    const model = data[BAKERY_SHEET_ID];
    if (model === undefined) continue;
    if (resource.name === CHART_RESOURCE) {
      if (!Array.isArray(model) || model.length > MAX_SCENARIO_CHARTS) return fail(`Use at most ${MAX_SCENARIO_CHARTS} charts per scenario.`);
      for (const chart of model) {
        if (!record(chart) || typeof chart.id !== 'string' || !record(chart.rangeInfo)) return fail('Invalid chart configuration.');
        // KnockOn charts use a rectangle in this scenario's fixed model, never external workbook sources.
        const source = chart.rangeInfo.rangeInfo;
        if (!record(source) || source.unitId !== workbook.id || source.subUnitId !== BAKERY_SHEET_ID || !record(source.range)) {
          return fail('Chart data must come from this scenario.');
        }
        const range = source.range;
        if (![range.startRow, range.endRow, range.startColumn, range.endColumn].every(Number.isInteger) ||
            Number(range.startRow) < 0 || Number(range.endRow) > 15 || Number(range.startRow) > Number(range.endRow) ||
            Number(range.startColumn) < 0 || Number(range.endColumn) > 1 || Number(range.startColumn) > Number(range.endColumn)) {
          return fail('Chart data must stay within A1:B16.');
        }
        // External header references are not needed by the fixed-template chart UI.
        if (record(chart.rangeInfo.header) && chart.rangeInfo.header.titles !== undefined) return fail('Use worksheet cells as chart labels.');
        chartIds.push(chart.id);
      }
    } else {
      if (!record(model) || !record(model.data) || !Array.isArray(model.order)) return fail('Invalid chart placement.');
      for (const [id, drawing] of Object.entries(model.data)) {
        if (!record(drawing) || drawing.drawingType !== 2 || drawing.componentKey !== 'SheetsChartComponent' ||
            drawing.unitId !== workbook.id || drawing.subUnitId !== BAKERY_SHEET_ID || drawing.drawingId !== id) {
          return fail('Only charts from this scenario can be placed on the worksheet.');
        }
        drawingIds.push(id);
      }
      if (model.order.length !== drawingIds.length || new Set(model.order).size !== drawingIds.length ||
          model.order.some((id) => typeof id !== 'string' || !drawingIds.includes(id))) return fail('Invalid chart order.');
    }
  }
  if (new Set(chartIds).size !== chartIds.length || chartIds.length !== drawingIds.length || chartIds.some((id) => !drawingIds.includes(id))) {
    return fail('Each chart must have matching worksheet placement.');
  }
  return [];
}

/** Fork chart references along with the workbook ID, so a response cannot read its parent's live data. */
export function copyWorkbookForScenario(workbook: BakeryWorkbook, id: string): BakeryWorkbook {
  const copy = structuredClone(workbook);
  copy.id = id;
  const replace = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(replace);
    if (!record(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, key === 'unitId' && v === workbook.id ? id : replace(v)]));
  };
  if (Array.isArray(copy.resources)) {
    copy.resources = (copy.resources as Resource[]).map((resource) =>
      [CHART_RESOURCE, DRAWING_RESOURCE].includes(resource.name)
        ? { ...resource, data: JSON.stringify(replace(JSON.parse(resource.data))) }
        : resource,
    );
  }
  return copy;
}
