import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analysisRequestSchema } from '@/lib/contracts/analysis';
import type { Project, Scenario } from '@/lib/contracts/project';
import { BAKERY_BLANK_INPUTS, BAKERY_DEMO_INPUTS, buildBakeryWorkbook, type BakeryInputKey } from '@/lib/templates/bakery';
import { AnalysisService, calculateProjectAnalysis } from '@/server/analysis';
import { openDatabase } from '@/server/db';
import { ProjectService } from '@/server/projects';
import { ApiError } from '@/server/errors';

function projectWith(cases: Record<string, Partial<Record<BakeryInputKey, number>>>, blank = false): Project {
  const scenarios = Object.entries(cases).map(([name, changes], index): Scenario => ({
    id: name, name, kind: index === 0 ? 'baseline' : 'shock', parentScenarioId: index === 0 ? null : Object.keys(cases)[0],
    workbook: buildBakeryWorkbook({ ...(blank ? BAKERY_BLANK_INPUTS : BAKERY_DEMO_INPUTS), ...changes }, name) as Scenario['workbook'],
    notes: '', assumptions: [], calculation: { status: 'valid', inputs: {}, metrics: {}, errors: [] }, createdAt: '', updatedAt: '',
  }));
  return { id: 'test', name: 'Analysis', currency: 'GBP', templateId: 'bakery-v1', templateVersion: 1, schemaVersion: 1,
    revision: 1, baselineFrozen: true, baselineScenarioId: scenarios[0].id, scenarios, demo: true, createdAt: '', updatedAt: '' };
}

describe('Univer break-even and sensitivity', () => {
  it('calculates all demo thresholds and profits without changing saved workbooks or trusting caches', async () => {
    const project = projectWith({
      baseline: {}, energy: { monthlyEnergy: 600 }, price: { monthlyEnergy: 600, unitPrice: 5.5, monthlyUnits: 950 },
      supplier: { monthlyEnergy: 600, ingredientCostPerUnit: 1.8, monthlyDelivery: 100 },
    });
    (project.scenarios[0].workbook.sheets.model as any).cellData[14][1].v = 999999;
    const original = structuredClone(project);
    const result = await calculateProjectAnalysis(project, { expectedRevision: 1, minUnits: 500, maxUnits: 1500 });
    assert.deepEqual(result.scenarios.map((s) => s.breakEvenUnits), [767, 834, 715, 813]);
    assert.deepEqual(result.scenarios.map((s) => s.breakEvenStatus), ['attainable', 'attainable', 'attainable', 'attainable']);
    const [baseline, energy, price, supplier] = result.scenarios;
    assert.deepEqual(baseline.points.filter((p) => [500, 1000, 1500].includes(p.units)).map((p) => p.profit), [-800, 700, 2200]);
    assert.deepEqual(energy.points.filter((p) => [500, 1000, 1500].includes(p.units)).map((p) => p.profit), [-1000, 500, 2000]);
    assert.equal(price.points.find((p) => p.units === 1000)!.profit, 1000);
    assert.equal(supplier.points.find((p) => p.units === 1000)!.profit, 600);
    assert.deepEqual(project, original);
  });

  it('handles positive, zero and negative contribution with and without overheads', async () => {
    const project = projectWith({
      positive: { unitPrice: 3, ingredientCostPerUnit: 1 },
      allZero: {},
      equal: { unitPrice: 2, ingredientCostPerUnit: 2 },
      equalWithCosts: { unitPrice: 2, ingredientCostPerUnit: 2, monthlyEnergy: 10 },
      negative: { unitPrice: 1, ingredientCostPerUnit: 2 },
      negativeWithCosts: { unitPrice: 1, ingredientCostPerUnit: 2, monthlyEnergy: 10 },
    }, true);
    const result = await calculateProjectAnalysis(project, { expectedRevision: 1, minUnits: 0, maxUnits: 10 });
    assert.deepEqual(result.scenarios.map((s) => [s.breakEvenStatus, s.breakEvenUnits]), [
      ['attainable', 0], ['any-volume', 0], ['any-volume', 0], ['unreachable', null], ['zero-sales-only', 0], ['unreachable', null],
    ]);
    assert.deepEqual(result.scenarios.map((s) => s.points.at(-1)!.profit), [20, 0, 0, -10, -10, -20]);
  });

  it('includes endpoints without duplicate samples for narrow ranges and does not round an exact threshold up again', async () => {
    const project = projectWith({ exact: { unitPrice: 5, ingredientCostPerUnit: 2, monthlyEnergy: 6 } }, true);
    const result = await calculateProjectAnalysis(project, { expectedRevision: 1, minUnits: 1, maxUnits: 2 });
    assert.equal(result.scenarios[0].breakEvenUnits, 2);
    assert.deepEqual(result.scenarios[0].points.map((p) => [p.units, p.profit]), [[1, -3], [2, 0]]);
  });

  it('does not add a unit when floating-point noise sits on an exact whole-unit threshold', async () => {
    const project = projectWith({
      // 15 / (4.35 - 4.05) is exactly 50, but 4.35 - 4.05 = 0.2999999999999998 in binary floating point.
      fifty: { unitPrice: 4.35, ingredientCostPerUnit: 4.05, monthlyRent: 15 },
      // Overheads 0.1 + 0.2 = 0.30000000000000004 and contribution 0.3 - 0.2 = 0.09999999999999998: exactly 3.
      three: { unitPrice: 0.3, ingredientCostPerUnit: 0.2, monthlyEnergy: 0.1, monthlyRent: 0.2 },
      hundred: { unitPrice: 5.1, ingredientCostPerUnit: 2, monthlyRent: 310 },
      // A one-penny contribution against very large overheads: exactly 100,000,000,000.
      penny: { unitPrice: 2.01, ingredientCostPerUnit: 2, monthlyRent: 1_000_000_000 },
      // Just over a whole unit must still round up: 100.5 / 1 needs 101.
      over: { unitPrice: 2, ingredientCostPerUnit: 1, monthlyRent: 100.5 },
    }, true);
    const result = await calculateProjectAnalysis(project, { expectedRevision: 1, minUnits: 0, maxUnits: 1_000_000_000 });
    assert.deepEqual(result.scenarios.map((s) => s.breakEvenUnits), [50, 3, 100, 100_000_000_000, 101]);
    assert.deepEqual(result.scenarios.map((s) => s.contributionPerUnit), [0.3, 0.1, 3.1, 0.01, 1]);
    // The largest accepted range still returns finite, whole-number samples including both endpoints.
    const units = result.scenarios[0].points.map((p) => p.units);
    assert.equal(units.length, 11);
    assert.deepEqual([units[0], units.at(-1)], [0, 1_000_000_000]);
    assert.ok(units.every(Number.isInteger));
  });

  it('rejects invalid sales ranges', () => {
    for (const [minUnits, maxUnits] of [[-1, 10], [0.5, 10], [0, 10.5], [5, 5], [10, 5], [0, 1_000_000_001], [null, 10], [0, '']]) {
      assert.equal(analysisRequestSchema.safeParse({ expectedRevision: 1, minUnits, maxUnits }).success, false);
    }
  });

  it('enforces ownership and revision and leaves the persisted project unchanged', async () => {
    const db = await openDatabase(':memory:');
    try {
      const projects = new ProjectService(db, 'owner');
      const initial = await projects.createProject({ name: 'Private bakery', currency: 'GBP', templateId: 'bakery-v1', initialData: 'demo' });
      const frozen = await projects.forkScenario(initial.id, { expectedRevision: initial.revision, sourceScenarioId: initial.baselineScenarioId, kind: 'shock', name: 'Energy' });
      const request = { expectedRevision: frozen.revision, minUnits: 0, maxUnits: 1000 };
      const service = new AnalysisService(db, 'owner');
      const result = await service.analyse(frozen.id, request);
      assert.equal(result.projectRevision, frozen.revision);
      assert.equal(result.scenarios[0].breakEvenUnits, 767);
      assert.deepEqual(await projects.getProject(frozen.id), frozen);
      await assert.rejects(new AnalysisService(db, 'stranger').analyse(frozen.id, request), (e: unknown) => e instanceof ApiError && e.status === 404);
      await assert.rejects(service.analyse(frozen.id, { ...request, expectedRevision: 1 }), (e: unknown) => e instanceof ApiError && e.status === 409);
      // Simulate a concurrent save after the first project read but before the final freshness check.
      let reads = 0;
      const racingDb = {
        ...db,
        query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
          if (sql.startsWith('SELECT * FROM projects WHERE id') && ++reads === 2) {
            await db.query('UPDATE projects SET revision = revision + 1 WHERE id = $1', [frozen.id]);
          }
          return db.query<T>(sql, params);
        },
      };
      await assert.rejects(new AnalysisService(racingDb, 'owner').analyse(frozen.id, request), (e: unknown) => e instanceof ApiError && e.status === 409);
    } finally { await db.close(); }
  });
});
