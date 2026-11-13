import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IWorkbookData } from '@univerjs/core';
import { openDatabase } from '@/server/db';
import { ProjectService } from '@/server/projects';
import { AnalysisReportService, wrapWords } from '@/server/analysis-report';
import { ApiError } from '@/server/errors';
import { isFormulaErrorLiteral } from '@/lib/univer/calculate';
import type { BakeryWorkbook } from '@/lib/univer/snapshot';

describe('Analysis reports', () => {
  it('exports a calculated multi-sheet report with a real chart, inputs and assumptions without changing the project', async () => {
    const db = await openDatabase(':memory:');
    try {
      const projects = new ProjectService(db, 'owner');
      let p = await projects.createProject({ name: '=Untrusted name', currency: 'GBP', initialData: 'demo', templateId: 'bakery-v1' });
      p = await projects.forkScenario(p.id, { expectedRevision: p.revision, sourceScenarioId: p.baselineScenarioId, name: 'Energy', kind: 'shock' });
      const shock = p.scenarios.find((s) => s.kind === 'shock')!;
      const workbook = structuredClone(shock.workbook) as unknown as BakeryWorkbook;
      workbook.sheets.model.cellData![4][1]!.v = 600;
      p = await projects.updateScenario(p.id, shock.id, { expectedRevision: p.revision, workbook, name: shock.name, assumptions: shock.assumptions, notes: 'Do not treat these fictional figures as a forecast.' });
      let conversions = 0;
      let converted: IWorkbookData | undefined;
      const service = new AnalysisReportService(db, 'owner', async (w) => { conversions++; converted = w; return Buffer.from('PK-report'); });
      const request = { expectedRevision: p.revision, scenarioId: shock.id, minUnits: 500, maxUnits: 1500 };
      const file = await service.export(p.id, request);
      assert.equal(conversions, 1);
      assert.match(file.filename, /Energy-analysis-r3\.xlsx$/);
      assert.deepEqual(converted!.sheetOrder, ['report', 'analysis_0', 'analysis_1']);
      const reportWorkbook = converted as unknown as BakeryWorkbook;
      const cells = reportWorkbook.sheets.report.cellData!;
      const text = Object.values(cells).flatMap((row) => Object.values(row ?? {}).map((cell) => cell?.v ?? '')).join(' ');
      assert.match(text, /Hypothetical sales, not a demand forecast/);
      assert.match(text, /Do not treat these fictional figures as a forecast/);
      assert.match(text, /fictional demo, unconfirmed/);
      assert.match(text, /GBP/);
      const reportCells = Object.values(cells).flatMap((row) => Object.values(row ?? {}));
      assert.ok(reportCells.some((c) => c?.f === "='analysis_1'!B19" && c.v === 834));
      assert.ok(reportCells.some((c) => c?.f === "='analysis_0'!B19" && c.v === 767));
      assert.ok(reportCells.some((c) => c?.f === "='analysis_1'!D29" && c.v === 500));
      assert.ok(reportCells.some((c) => c?.f === "='analysis_0'!D29" && c.v === 700));
      assert.ok(reportCells.some((c) => c?.v === 'Project: =Untrusted name' && !c.f && c.t === 1));
      for (const sheet of Object.values(reportWorkbook.sheets)) for (const row of Object.values(sheet.cellData ?? {})) for (const cell of Object.values(row ?? {})) {
        assert.equal(isFormulaErrorLiteral(cell?.v), false, `formula ${cell?.f} returned ${cell?.v}`);
      }
      const charts = converted!.resources!.find((r) => r.name === 'SHEET_CHART_PLUGIN');
      assert.ok(charts);
      const chart = JSON.parse(charts.data).report[0];
      assert.equal(chart.rangeInfo.rangeInfo.subUnitId, 'report');
      assert.equal(chart.rangeInfo.rangeInfo.unitId, converted!.id);
      assert.deepEqual(chart.context.seriesIndexes, [3, 4]);
      assert.equal(converted!.sheets.analysis_1.cellData![14][1]!.f, '=B11-B14');
      assert.deepEqual(await projects.getProject(p.id), p);
      await assert.rejects(service.export(p.id, { ...request, expectedRevision: 1 }), (e: unknown) => e instanceof ApiError && e.status === 409);
      await assert.rejects(service.export(p.id, { ...request, scenarioId: 'missing' }), (e: unknown) => e instanceof ApiError && e.status === 404);
      await assert.rejects(service.export(p.id, { ...request, minUnits: 1500 }), (e: unknown) => e instanceof ApiError && e.status === 400);
      await assert.rejects(new AnalysisReportService(db, 'stranger').report(p.id, request), (e: unknown) => e instanceof ApiError && e.status === 404);
      assert.equal(conversions, 1, 'invalid requests must not consume licensed conversion');
      const racing = new AnalysisReportService(db, 'owner', async () => {
        await db.query('UPDATE projects SET revision = revision + 1 WHERE id = $1', [p.id]);
        return Buffer.from('PK-stale');
      });
      await assert.rejects(racing.export(p.id, request), (e: unknown) => e instanceof ApiError && e.status === 409);
    } finally { await db.close(); }
  });

  it('keeps a zero-overhead baseline report valid and uses only one chart series', async () => {
    const db = await openDatabase(':memory:');
    try {
      const projects = new ProjectService(db, 'owner');
      const p = await projects.createProject({ name: 'Blank', currency: 'USD', initialData: 'blank', templateId: 'bakery-v1' });
      const report = await new AnalysisReportService(db, 'owner').report(p.id, { expectedRevision: p.revision, scenarioId: p.baselineScenarioId, minUnits: 0, maxUnits: 1 });
      const workbook = report.workbook as unknown as IWorkbookData;
      const cells = (report.workbook as unknown as BakeryWorkbook).sheets.report.cellData!;
      const values = Object.values(cells).flatMap((r) => Object.values(r ?? {}).map((c) => c?.v));
      assert.ok(values.includes('Break-even at every volume'));
      assert.ok(values.includes('No assumptions recorded.'));
      const charts = JSON.parse(workbook.resources!.find((r) => r.name === 'SHEET_CHART_PLUGIN')!.data);
      assert.deepEqual(charts.report[0].context.seriesIndexes, [3]);
    } finally { await db.close(); }
  });

  it('wraps report notes at word boundaries', () => {
    const lines = wrapWords('Hypothetical sales, not a demand forecast. Unit price, ingredient cost per unit and monthly overheads stay fixed within each scenario.', 40);
    assert.ok(lines.every((l) => l.length <= 40));
    assert.equal(lines.join(' '), 'Hypothetical sales, not a demand forecast. Unit price, ingredient cost per unit and monthly overheads stay fixed within each scenario.');
    assert.ok(lines.every((l) => !l.startsWith(' ') && !l.endsWith(' ')));
    // Only a single word longer than a line is split.
    assert.deepEqual(wrapWords('see https://example.com/a-very-long-path ok', 12), ['see', 'https://exam', 'ple.com/a-ve', 'ry-long-path', 'ok']);
    assert.deepEqual(wrapWords('', 10), []);
  });

  it('builds the printable report without a chart, and says where the chart is', async () => {
    const db = await openDatabase(':memory:');
    try {
      const projects = new ProjectService(db, 'owner');
      const p = await projects.createProject({ name: 'Print', currency: 'GBP', initialData: 'demo', templateId: 'bakery-v1' });
      const request = { expectedRevision: p.revision, scenarioId: p.baselineScenarioId, minUnits: 500, maxUnits: 1500 };
      const service = new AnalysisReportService(db, 'owner');
      const printable = (await service.report(p.id, request, { chart: false })).workbook as unknown as IWorkbookData & BakeryWorkbook;
      const charts = printable.resources?.find((r) => r.name === 'SHEET_CHART_PLUGIN');
      assert.ok(!charts || !JSON.parse(charts.data).report?.length, 'no chart in the printable report');
      const text = Object.values(printable.sheets.report.cellData!).flatMap((r) => Object.values(r!)).map((c) => String(c?.v ?? '')).join(' ');
      assert.match(text, /Excel download \(Export analysis Excel\) adds a line chart/);
      // The Excel version still has the chart.
      const full = (await service.report(p.id, request)).workbook as unknown as IWorkbookData;
      assert.ok(JSON.parse(full.resources!.find((r) => r.name === 'SHEET_CHART_PLUGIN')!.data).report.length === 1);
    } finally { await db.close(); }
  });
});
