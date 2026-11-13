import type { IWorkbookData } from '@univerjs/core';
import { analysisReportRequestSchema, type AnalysisReport, type AnalysisReportRequest } from '@/lib/contracts/analysis';
import { BAKERY_INPUTS, BAKERY_SIMPLIFICATIONS } from '@/lib/templates/bakery';
import { calculateTrustedWorkbook } from '@/lib/univer/server/recalculate';
import type { BakeryCellData, BakeryCellMatrix, BakerySheetData } from '@/lib/univer/snapshot';
import { calculateProjectAnalysisWorkbook } from './analysis';
import type { Sql } from './db';
import { ApiError, notFound, revisionConflict } from './errors';
import { convertWorkbookToExcel, excelFilename, type WorkbookConverter } from './exports';
import { ProjectService } from './projects';

const REPORT_ID = 'report';
const TEXT = 1;
const ink = '#072D36';
const titleStyle = { bl: 1, fs: 18, cl: { rgb: '#FFFFFF' }, bg: { rgb: ink }, vt: 2 };
const headingStyle = { bl: 1, bg: { rgb: '#FFF8EE' }, cl: { rgb: ink }, tb: 3, vt: 2 };
const normalStyle: Record<string, unknown> = { fs: 11, tb: 3, vt: 2 };
const numericStyle = { ...normalStyle, n: { pattern: '#,##0.00;[Red]-#,##0.00' } };

const WRAP_CHARS = 110;
const ROW_TEXT = 24;

/**
 * Split text into lines of at most `width` characters at spaces, so printed notes
 * never break inside a word. A single word longer than a line (a pasted URL, say)
 * is the only thing split mid-word.
 */
export function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const chars = Array.from(word);
    if (chars.length > width) {
      if (current) { lines.push(current); current = ''; }
      for (let i = 0; i < chars.length; i += width) lines.push(chars.slice(i, i + width).join(''));
      current = lines.pop() ?? '';
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (Array.from(next).length > width) { lines.push(current); current = word; } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

/** A server-built report, never a client-supplied workbook. No stored project is changed. */
export class AnalysisReportService {
  private readonly projects: ProjectService;
  constructor(db: Sql, ownerHash: string, private readonly convert: WorkbookConverter = convertWorkbookToExcel) {
    this.projects = new ProjectService(db, ownerHash);
  }

  private async assertRevision(projectId: string, revision: number) {
    const latest = await this.projects.getProject(projectId);
    if (latest.revision !== revision) throw revisionConflict(latest.revision);
  }

  /**
   * `chart: false` builds the printable report. Univer 1.4.0's print renders a
   * worksheet chart as an empty frame (the preview draws it only after a re-render,
   * the printed pages never), so the printed report leaves the chart out rather than
   * print an empty box; the table holds the same figures. Excel keeps the chart.
   */
  async report(projectId: string, request: AnalysisReportRequest, { chart = true }: { chart?: boolean } = {}): Promise<AnalysisReport> {
    const parsed = analysisReportRequestSchema.safeParse(request);
    if (!parsed.success) throw new ApiError(400, 'BAD_REQUEST', 'Choose a valid scenario, saved revision and whole-number sales range.');
    const project = await this.projects.getProject(projectId);
    if (project.revision !== request.expectedRevision) throw revisionConflict(project.revision);
    const scenario = project.scenarios.find((s) => s.id === request.scenarioId);
    if (!scenario) throw notFound('Scenario');
    const { analysis, workbook } = await calculateProjectAnalysisWorkbook(project, parsed.data);
    const selectedIndex = analysis.scenarios.findIndex((s) => s.scenarioId === scenario.id);
    const baselineIndex = analysis.scenarios.findIndex((s) => s.scenarioId === project.baselineScenarioId);
    const selected = analysis.scenarios[selectedIndex];
    const count = selected.points.length;
    const ref = (index: number, cell: string) => `'analysis_${index}'!${cell}`;
    const cells: BakeryCellMatrix = {};
    const merges: { startRow: number; endRow: number; startColumn: number; endColumn: number }[] = [];
    const rows: Record<number, { h: number }> = {};
    let row = 0;
    const put = (r: number, col: number, value: BakeryCellData) => {
      (cells[r] ??= {})[col] = { s: normalStyle, ...value };
    };
    const text = (r: number, col: number, value: string, style = normalStyle) => put(r, col, { v: value, t: TEXT, s: style });
    const full = (value: string, style = normalStyle, height = 30) => {
      text(row, 0, value, style); merges.push({ startRow: row, endRow: row, startColumn: 0, endColumn: 4 }); rows[row] = { h: height }; row++;
    };
    const paragraph = (value: string) => {
      // Give long notes their own printable rows instead of clipping or silently truncating them.
      for (const line of value.split(/\r?\n/)) {
        const lines = wrapWords(line, WRAP_CHARS);
        if (!lines.length) full('', normalStyle, ROW_TEXT);
        for (const part of lines) full(part, normalStyle, ROW_TEXT);
      }
    };
    const headers = (labels: string[]) => { labels.forEach((label, col) => text(row, col, label, headingStyle)); rows[row] = { h: 38 }; row++; };
    const units = (n: number) => n.toLocaleString('en-GB');
    const formula = (r: number, col: number, f: string, whole = false) => put(r, col, { f, s: whole ? { ...normalStyle, n: { pattern: '#,##0' } } : numericStyle });

    full('KnockOn — Break-even & sales sensitivity', titleStyle, 42);
    paragraph(`Project: ${project.name}`);
    paragraph(`Selected scenario: ${scenario.name}`);
    full(`Saved revision ${project.revision} · Currency: ${project.currency} · Monthly sales range: ${units(request.minUnits)}–${units(request.maxUnits)} units`, normalStyle, ROW_TEXT);
    paragraph('Hypothetical sales, not a demand forecast. Unit price, ingredient cost per unit and monthly overheads stay fixed within each scenario.');
    if (project.demo) paragraph('This project started with fictional demo figures for learning. Read the recorded assumptions before using these results.');
    row++;
    full('Break-even across saved scenarios', headingStyle);
    headers(['Scenario', 'Minimum units / month', 'Interpretation', `Contribution / unit (${project.currency})`, `Overheads (${project.currency})`]);
    analysis.scenarios.forEach((s, index) => {
      text(row, 0, s.name);
      formula(row, 1, `=${ref(index, 'B19')}`, true);
      // Interpretation is also a formula, so it stays consistent if the downloaded workbook is edited.
      put(row, 2, { f: `=IF(${ref(index, 'B18')}>0,"Minimum to cover costs",IF(${ref(index, 'B13')}>0,"Costs cannot be covered",IF(${ref(index, 'B18')}=0,"Break-even at every volume","Only at zero sales")))` });
      formula(row, 3, `=${ref(index, 'B18')}`); formula(row, 4, `=${ref(index, 'B13')}`);
      rows[row++] = { h: 34 };
    });
    paragraph('Whole-unit thresholds are rounded up. A blank threshold means costs cannot be covered. The calculation rounds contribution to 9 decimal places and the quotient to 6 to limit floating-point noise.');
    row++;
    full('Sales sensitivity — selected scenario and baseline', headingStyle);
    headers(['Units / month', `Revenue (${project.currency})`, `Total costs (${project.currency})`, `Selected profit (${project.currency})`, `Baseline profit (${project.currency})`]);
    const sourceHeader = row; // 1-based row of the header just written.
    for (let i = 0; i < count; i++) {
      const sourceRow = 24 + i;
      formula(row, 0, `=${ref(selectedIndex, `A${sourceRow}`)}`, true);
      for (const [col, source] of [[1, 'B'], [2, 'C'], [3, 'D']] as const) formula(row, col, `=${ref(selectedIndex, `${source}${sourceRow}`)}`);
      formula(row, 4, `=${ref(baselineIndex, `D${sourceRow}`)}`);
      rows[row++] = { h: 24 };
    }
    row++;
    const chartRow = row + 1;
    if (chart) {
      // Reserve space for a real Univer worksheet chart, preserved in the Excel file.
      for (let i = 0; i < 13; i++) rows[row++] = { h: 26 };
      row++;
    } else {
      paragraph('The Excel download (Export analysis Excel) adds a line chart of these figures. The table above contains the same values.');
      row++;
    }
    full('Source inputs — saved estimates stay unchanged', headingStyle);
    headers(['Input', 'Selected scenario', 'Baseline', 'Period / unit', 'Source cell']);
    BAKERY_INPUTS.forEach((input) => {
      text(row, 0, input.label);
      formula(row, 1, `=${ref(selectedIndex, input.cell)}`, input.key === 'monthlyUnits');
      formula(row, 2, `=${ref(baselineIndex, input.cell)}`, input.key === 'monthlyUnits');
      text(row, 3, input.key === 'monthlyUnits' ? 'Units / month' : input.key === 'unitPrice' || input.key === 'ingredientCostPerUnit' ? `${project.currency} / unit` : `${project.currency} / month`, { ...normalStyle, ht: 2 });
      text(row, 4, input.cell); rows[row++] = { h: 26 };
    });
    row++;
    full('Recorded assumptions', headingStyle);
    for (const s of project.scenarios.filter((s) => s.id === scenario.id || s.id === project.baselineScenarioId)) {
      paragraph(`${s.name}${s.kind === 'baseline' ? ' (baseline)' : ''}`);
      if (s.notes) paragraph(`Scenario notes: ${s.notes}`);
      if (!s.assumptions.length) paragraph('No assumptions recorded.');
      for (const assumption of s.assumptions) {
        const input = BAKERY_INPUTS.find((i) => i.key === assumption.inputKey)!;
        paragraph(`${input.cell} ${input.label} — ${assumption.source === 'demo' ? 'fictional demo' : 'user input'}, ${assumption.confirmed ? 'confirmed' : 'unconfirmed'}: ${assumption.note || 'No note recorded.'}`);
        if (assumption.confirmedFor) paragraph(`Confirmation recorded for unit price ${assumption.confirmedFor.unitPrice} ${project.currency} and ${assumption.confirmedFor.monthlyUnits} units / month.`);
      }
    }
    full('Model limits', headingStyle);
    BAKERY_SIMPLIFICATIONS.forEach(paragraph);
    paragraph('Production capacity and customer demand responses are not modelled. Results describe this saved revision and this chosen sales range. No decision is recommended.');
    full('Calculated with Univer · knockon.tech', headingStyle);

    workbook.sheets[REPORT_ID] = {
      id: REPORT_ID, name: 'Analysis report', cellData: cells, mergeData: merges, rowData: rows,
      rowCount: row, columnCount: 5, defaultRowHeight: 28, defaultColumnWidth: 140,
      columnData: { 0: { w: 260 }, 1: { w: 140 }, 2: { w: 160 }, 3: { w: 160 }, 4: { w: 150 } }, showGridlines: 0,
    } as BakerySheetData;
    // Keep supporting sheets visible in Excel for inspecting and editing formulas.
    analysis.scenarios.forEach((s, index) => {
      const sheet = workbook.sheets[`analysis_${index}`];
      const data = sheet.cellData!;
      data[0][0] = { v: s.name, t: TEXT, s: titleStyle };
      data[1][3] = { v: 'Minimum units', t: TEXT };
      data[2][3] = { v: 'Maximum units', t: TEXT };
      data[22] = Object.fromEntries(['Units / month', 'Revenue', 'Total costs', 'Profit'].map((label, i) => [i, { v: label, t: TEXT, s: headingStyle }]));
      sheet.columnData = { 0: { w: 260 }, 1: { w: 150 }, 2: { w: 150 }, 3: { w: 150 }, 4: { w: 150 } };
    });
    workbook.sheetOrder = [REPORT_ID, ...analysis.scenarios.map((_, index) => `analysis_${index}`)];
    workbook.name = `${project.name} — analysis r${project.revision}`;
    const calculated = await calculateTrustedWorkbook(workbook, !chart ? undefined : async (api) => {
      const sheet = api.getActiveWorkbook()!.getSheetBySheetId(REPORT_ID)!;
      const info = sheet.newChart(api.Enum.ChartTypeString.Line)
        .setSource({ range: `A${sourceHeader}:E${sourceHeader + count}`, orientation: api.Enum.ChartSourceOrientation.Columns, header: { band: { startOffset: 0, endOffset: 0 } } })
        .setCategoryField(0).setValueFields(selectedIndex === baselineIndex ? [3] : [3, 4])
        .setPosition(`A${chartRow}`).setSize(820, 310)
        .setTitle(`Monthly profit (${project.currency}) by sales volume`).build();
      await sheet.insertChart(info);
    });
    await this.assertRevision(projectId, request.expectedRevision);
    return { projectId, projectName: project.name, scenarioName: scenario.name, projectRevision: project.revision,
      minUnits: request.minUnits, maxUnits: request.maxUnits, workbook: calculated as AnalysisReport['workbook'] };
  }

  async export(projectId: string, request: AnalysisReportRequest) {
    const report = await this.report(projectId, request);
    const buffer = await this.convert(report.workbook as unknown as IWorkbookData);
    await this.assertRevision(projectId, request.expectedRevision);
    return { buffer, filename: excelFilename({ name: report.projectName, revision: report.projectRevision }, { name: `${report.scenarioName}-analysis` }), revision: report.projectRevision };
  }
}
