import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fixture from './fixtures/chart-resources.json';
import { BAKERY_DEMO_INPUTS, buildBakeryWorkbook } from '@/lib/templates/bakery';
import { CHART_RESOURCE, DRAWING_RESOURCE, copyWorkbookForScenario } from '@/lib/univer/chart-resources';
import { validateBakerySnapshot, type BakeryWorkbook } from '@/lib/univer/snapshot';
import { recalculateWorkbook } from '@/lib/univer/server/recalculate';
import { openDatabase } from '@/server/db';
import { ProjectService } from '@/server/projects';
import { ApiError } from '@/server/errors';

function chartedWorkbook() {
  const workbook = buildBakeryWorkbook(BAKERY_DEMO_INPUTS, 'chart-probe') as BakeryWorkbook;
  workbook.resources = structuredClone(fixture);
  return workbook;
}

function resources(workbook: Record<string, unknown>) {
  return (workbook.resources as { name: string; data: string }[]).filter((r) => [CHART_RESOURCE, DRAWING_RESOURCE].includes(r.name));
}

describe('Univer chart persistence', () => {
  it('keeps chart models and anchors through server recalculation and remaps references on a scenario fork', async () => {
    const db = await openDatabase(':memory:');
    try {
      const service = new ProjectService(db, 'chart-owner');
      let project = await service.createProject({ name: 'Charted bakery', currency: 'GBP', templateId: 'bakery-v1', initialData: 'demo' });
      const baseline = project.scenarios[0];
      const workbook = copyWorkbookForScenario(chartedWorkbook(), baseline.workbook.id);
      project = await service.updateScenario(project.id, baseline.id, { expectedRevision: project.revision, name: baseline.name, notes: '', assumptions: baseline.assumptions, workbook });
      assert.equal(resources(project.scenarios[0].workbook).length, 2);
      assert.equal(JSON.parse(resources(project.scenarios[0].workbook).find((r) => r.name === CHART_RESOURCE)!.data).model.length, 1);
      project = await service.forkScenario(project.id, { expectedRevision: project.revision, sourceScenarioId: baseline.id, kind: 'shock', name: 'Higher energy' });
      const shock = project.scenarios.find((s) => s.kind === 'shock')!;
      const cloned = resources(shock.workbook);
      assert.equal(cloned.length, 2);
      assert.ok(cloned.every((r) => !r.data.includes(baseline.workbook.id)));
      assert.ok(cloned.every((r) => r.data.includes(shock.workbook.id)));
      const edited = structuredClone(shock.workbook) as BakeryWorkbook;
      edited.sheets.model.cellData![4][1]!.v = 600;
      project = await service.updateScenario(project.id, shock.id, { expectedRevision: project.revision, name: shock.name, notes: '', assumptions: shock.assumptions, workbook: edited });
      assert.equal(project.scenarios[0].calculation.metrics.profit, 700);
      assert.equal(project.scenarios.find((s) => s.id === shock.id)!.calculation.metrics.profit, 500);
      const reloaded = await service.getProject(project.id);
      assert.equal(resources(reloaded.scenarios.find((s) => s.id === shock.id)!.workbook).length, 2);
      await assert.rejects(service.updateScenario(project.id, baseline.id, { expectedRevision: project.revision, name: baseline.name, notes: '', assumptions: baseline.assumptions, workbook }), (e: unknown) => e instanceof ApiError && e.code === 'BASELINE_FROZEN');
    } finally { await db.close(); }
  });

  it('rejects cross-scenario chart sources, external drawings, missing anchors and damaged chart JSON', () => {
    for (const mutate of [
      (rs: typeof fixture) => { rs.find((r) => r.name === CHART_RESOURCE)!.data = rs.find((r) => r.name === CHART_RESOURCE)!.data.replaceAll('chart-probe', 'another-owner-workbook'); },
      (rs: typeof fixture) => { rs.find((r) => r.name === DRAWING_RESOURCE)!.data = rs.find((r) => r.name === DRAWING_RESOURCE)!.data.replace('SheetsChartComponent', 'Image'); },
      (rs: typeof fixture) => { rs.splice(rs.findIndex((r) => r.name === DRAWING_RESOURCE), 1); },
      (rs: typeof fixture) => { rs.find((r) => r.name === CHART_RESOURCE)!.data = 'not json'; },
    ]) {
      const workbook = chartedWorkbook();
      mutate(workbook.resources as typeof fixture);
      assert.equal(validateBakerySnapshot(workbook).ok, false);
    }
  });

  it('continues to recalculate old workbooks without chart resources', async () => {
    const result = await recalculateWorkbook(buildBakeryWorkbook(BAKERY_DEMO_INPUTS, 'old-workbook'));
    assert.equal(result.projection.metrics.profit, 700);
  });
});
