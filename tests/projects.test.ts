import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { Assumption, Project, Scenario } from '@/lib/contracts/project';
import { BAKERY_INPUTS, type BakeryInputKey } from '@/lib/templates/bakery';
import { openDatabase } from '@/server/db';
import { ApiError } from '@/server/errors';
import { ProjectService } from '@/server/projects';

const close = (a: number | null | undefined, b: number) => assert.ok(a != null && Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

async function service() {
  return new ProjectService(await openDatabase(':memory:'), 'owner-a');
}

function scenario(project: Project, name: string): Scenario {
  const found = project.scenarios.find((s) => s.name === name);
  assert.ok(found, `scenario ${name}`);
  return found;
}

/** Return a copy of a scenario's workbook with some inputs changed (as the browser editor would). */
function editWorkbook(s: Scenario, changes: Partial<Record<BakeryInputKey, number>>) {
  const workbook = structuredClone(s.workbook) as any;
  for (const [key, value] of Object.entries(changes)) {
    const m = BAKERY_INPUTS.find((i) => i.key === key)!;
    workbook.sheets.model.cellData[m.row][m.col] = { v: value, t: 2 };
  }
  return workbook;
}

async function expectApiError(promise: Promise<unknown>, status: number, code: string): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ApiError, `expected ApiError, got ${error}`);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected ${status} ${code}`);
}

function confirmUnits(units: number, price: number, existing: Assumption[] = []): Assumption[] {
  return [
    ...existing.filter((a) => a.inputKey !== 'monthlyUnits'),
    { inputKey: 'monthlyUnits', note: 'Expect a few customers to buy less.', source: 'user', confirmed: true, confirmedFor: { unitPrice: price, monthlyUnits: units } },
  ];
}

async function bakeryWorkflow(svc: ProjectService) {
  let p = await svc.createProject({ name: 'Corner Bakery', currency: 'GBP', templateId: 'bakery-v1', initialData: 'demo' });
  p = await svc.forkScenario(p.id, { expectedRevision: p.revision, sourceScenarioId: p.baselineScenarioId, kind: 'shock', name: 'Energy shock' });
  const shock = scenario(p, 'Energy shock');
  p = await svc.updateScenario(p.id, shock.id, {
    expectedRevision: p.revision,
    name: shock.name,
    notes: 'Energy bill up 50%.',
    workbook: editWorkbook(shock, { monthlyEnergy: 600 }),
    assumptions: shock.assumptions,
  });
  p = await svc.forkScenario(p.id, { expectedRevision: p.revision, sourceScenarioId: shock.id, kind: 'response', name: 'Raise price' });
  const price = scenario(p, 'Raise price');
  p = await svc.updateScenario(p.id, price.id, {
    expectedRevision: p.revision,
    name: price.name,
    notes: '',
    workbook: editWorkbook(price, { unitPrice: 5.5, monthlyUnits: 950 }),
    assumptions: confirmUnits(950, 5.5, price.assumptions),
  });
  p = await svc.forkScenario(p.id, { expectedRevision: p.revision, sourceScenarioId: shock.id, kind: 'response', name: 'Switch supplier' });
  const supplier = scenario(p, 'Switch supplier');
  p = await svc.updateScenario(p.id, supplier.id, {
    expectedRevision: p.revision,
    name: supplier.name,
    notes: '',
    workbook: editWorkbook(supplier, { ingredientCostPerUnit: 1.8, monthlyDelivery: 100 }),
    assumptions: supplier.assumptions,
  });
  return p;
}

describe('bakery workflow', () => {
  it('matches the API contract fixtures', async () => {
    const p = await bakeryWorkflow(await service());
    const expected: Record<string, [number, number, number]> = {
      Baseline: [5000, 4300, 700],
      'Energy shock': [5000, 4500, 500],
      'Raise price': [5225, 4400, 825],
      'Switch supplier': [5000, 4400, 600],
    };
    for (const [name, [revenue, totalCosts, profit]] of Object.entries(expected)) {
      const m = scenario(p, name).calculation.metrics;
      close(m.revenue, revenue);
      close(m.totalCosts, totalCosts);
      close(m.profit, profit);
      assert.equal(scenario(p, name).calculation.status, 'valid');
    }
    const baselineProfit = scenario(p, 'Baseline').calculation.metrics.profit!;
    close(scenario(p, 'Raise price').calculation.metrics.profit! - baselineProfit, 125);
    close(scenario(p, 'Switch supplier').calculation.metrics.profit! - baselineProfit, -100);
    close(scenario(p, 'Baseline').calculation.metrics.marginFraction, 0.14);
    assert.equal(p.revision, 7);
    assert.equal(p.baselineFrozen, true);
    assert.equal(scenario(p, 'Raise price').parentScenarioId, scenario(p, 'Energy shock').id);
  });

  it('keeps formulas in saved workbooks and gives each scenario its own workbook id', async () => {
    const p = await bakeryWorkflow(await service());
    const ids = new Set(p.scenarios.map((s) => s.workbook.id));
    assert.equal(ids.size, p.scenarios.length);
    for (const s of p.scenarios) {
      const cells = (s.workbook as any).sheets.model.cellData;
      assert.equal(cells[10][1].f, '=B2*B3');
      assert.equal(cells[15][1].f, '=IF(B11=0,"",B15/B11)');
    }
  });

  it('forks without changing the source scenario', async () => {
    const svc = await service();
    const p = await bakeryWorkflow(svc);
    close(scenario(p, 'Energy shock').calculation.inputs.unitPrice, 5);
    close(scenario(p, 'Energy shock').calculation.inputs.monthlyEnergy, 600);
    close(scenario(p, 'Baseline').calculation.inputs.monthlyEnergy, 400);
  });

  it('survives reopening the database file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knockon-'));
    const file = path.join(dir, 'pglite');
    const db = await openDatabase(file);
    const p = await bakeryWorkflow(new ProjectService(db, 'owner-a'));
    await db.close();
    const reopenedDb = await openDatabase(file);
    const reopened = new ProjectService(reopenedDb, 'owner-a');
    const again = await reopened.getProject(p.id);
    assert.deepEqual(again, p);
    assert.equal((await reopened.listProjects())[0].id, p.id);
    await reopenedDb.close();
  });
});

describe('project creation', () => {
  it('starts a blank project at zero with no inferred assumptions and a null margin', async () => {
    const p = await (await service()).createProject({ name: 'Mine', currency: 'USD', templateId: 'bakery-v1', initialData: 'blank' });
    const baseline = p.scenarios[0];
    assert.equal(p.currency, 'USD');
    assert.equal(p.demo, false);
    assert.deepEqual(baseline.assumptions, []);
    assert.equal(baseline.calculation.metrics.revenue, 0);
    assert.equal(baseline.calculation.metrics.marginFraction, null);
  });

  it('labels demo figures as demo data', async () => {
    const p = await (await service()).createProject({ name: 'Demo', currency: 'EUR', templateId: 'bakery-v1', initialData: 'demo' });
    assert.equal(p.demo, true);
    assert.equal(p.scenarios[0].assumptions.length, 8);
    assert.ok(p.scenarios[0].assumptions.every((a) => a.source === 'demo'));
  });

  it('rejects an unknown template with 404', async () => {
    await expectApiError((await service()).createProject({ name: 'X', currency: 'EUR', templateId: 'nope', initialData: 'demo' }), 404, 'NOT_FOUND');
  });
});

describe('rules', () => {
  async function demoProject() {
    const svc = await service();
    const p = await svc.createProject({ name: 'Demo', currency: 'EUR', templateId: 'bakery-v1', initialData: 'demo' });
    return { svc, p };
  }

  it('rejects a stale revision with the current revision', async () => {
    const { svc, p } = await demoProject();
    const baseline = p.scenarios[0];
    const update = { expectedRevision: p.revision, name: 'Baseline', notes: '', workbook: editWorkbook(baseline, { monthlyRent: 650 }), assumptions: baseline.assumptions };
    await svc.updateScenario(p.id, baseline.id, update);
    const error = await expectApiError(svc.updateScenario(p.id, baseline.id, update), 409, 'REVISION_CONFLICT');
    assert.equal(error.details.currentRevision, 2);
  });

  it('freezes the baseline when the first shock is created', async () => {
    const { svc, p: created } = await demoProject();
    const p = await svc.forkScenario(created.id, { expectedRevision: 1, sourceScenarioId: created.baselineScenarioId, kind: 'shock', name: 'Shock' });
    const baseline = scenario(p, 'Baseline');
    await expectApiError(
      svc.updateScenario(p.id, baseline.id, { expectedRevision: p.revision, name: 'Baseline', notes: '', workbook: baseline.workbook, assumptions: baseline.assumptions }),
      409,
      'BASELINE_FROZEN',
    );
  });

  it('only forks shocks from the baseline and responses from shocks', async () => {
    const { svc, p } = await demoProject();
    await expectApiError(svc.forkScenario(p.id, { expectedRevision: 1, sourceScenarioId: p.baselineScenarioId, kind: 'response', name: 'R' }), 422, 'INVALID_FORK');
    await expectApiError(svc.forkScenario(p.id, { expectedRevision: 1, sourceScenarioId: 'scn_missing', kind: 'shock', name: 'S' }), 404, 'NOT_FOUND');
  });

  it('requires a confirmed sales assumption for a price change', async () => {
    const { svc, p: created } = await demoProject();
    let p = await svc.forkScenario(created.id, { expectedRevision: 1, sourceScenarioId: created.baselineScenarioId, kind: 'shock', name: 'Shock' });
    const shock = scenario(p, 'Shock');
    const base = { name: 'Shock', notes: '' };

    // No confirmation.
    const missing = await expectApiError(
      svc.updateScenario(p.id, shock.id, { ...base, expectedRevision: p.revision, workbook: editWorkbook(shock, { unitPrice: 6 }), assumptions: shock.assumptions }),
      422,
      'ASSUMPTION_REQUIRED',
    );
    assert.ok(missing.details.fields?.['assumptions.monthlyUnits']);

    // Confirmation for a different price is stale.
    await expectApiError(
      svc.updateScenario(p.id, shock.id, { ...base, expectedRevision: p.revision, workbook: editWorkbook(shock, { unitPrice: 6 }), assumptions: confirmUnits(1000, 5.5) }),
      422,
      'ASSUMPTION_REQUIRED',
    );

    // Confirming unchanged sales is valid.
    p = await svc.updateScenario(p.id, shock.id, { ...base, expectedRevision: p.revision, workbook: editWorkbook(shock, { unitPrice: 6 }), assumptions: confirmUnits(1000, 6) });
    const saved = scenario(p, 'Shock');
    assert.equal(saved.assumptions.find((a) => a.inputKey === 'monthlyUnits')?.confirmed, true);

    // Changing units again without re-confirming is rejected.
    await expectApiError(
      svc.updateScenario(p.id, shock.id, { ...base, expectedRevision: p.revision, workbook: editWorkbook(saved, { monthlyUnits: 900 }), assumptions: saved.assumptions }),
      422,
      'ASSUMPTION_REQUIRED',
    );
  });

  it('clears a stale confirmation when the price returns to the parent price', async () => {
    const { svc, p: created } = await demoProject();
    let p = await svc.forkScenario(created.id, { expectedRevision: 1, sourceScenarioId: created.baselineScenarioId, kind: 'shock', name: 'Shock' });
    const shock = scenario(p, 'Shock');
    p = await svc.updateScenario(p.id, shock.id, { name: 'Shock', notes: '', expectedRevision: p.revision, workbook: editWorkbook(shock, { unitPrice: 6 }), assumptions: confirmUnits(1000, 6) });
    const saved = scenario(p, 'Shock');
    p = await svc.updateScenario(p.id, shock.id, { name: 'Shock', notes: '', expectedRevision: p.revision, workbook: editWorkbook(saved, { unitPrice: 5 }), assumptions: saved.assumptions });
    const units = scenario(p, 'Shock').assumptions.find((a) => a.inputKey === 'monthlyUnits');
    assert.equal(units?.confirmed, false);
    assert.equal(units?.confirmedFor, undefined);
  });

  it('relabels a changed demo figure as the user’s own', async () => {
    const { svc, p } = await demoProject();
    const baseline = p.scenarios[0];
    const updated = await svc.updateScenario(p.id, baseline.id, { expectedRevision: 1, name: 'Baseline', notes: '', workbook: editWorkbook(baseline, { monthlyRent: 700 }), assumptions: baseline.assumptions });
    const rent = updated.scenarios[0].assumptions.find((a) => a.inputKey === 'monthlyRent');
    const wages = updated.scenarios[0].assumptions.find((a) => a.inputKey === 'monthlyWages');
    assert.equal(rent?.source, 'user');
    assert.equal(wages?.source, 'demo');
  });

  it('rejects tampered formulas, formula inputs, negative and blank inputs, and leaves the saved scenario unchanged', async () => {
    const { svc, p } = await demoProject();
    const baseline = p.scenarios[0];
    const tampered = editWorkbook(baseline, { monthlyRent: -5 }) as any;
    tampered.sheets.model.cellData[14][1] = { f: '=B11' };
    tampered.sheets.model.cellData[1][1] = { f: '=B3*100' };
    delete tampered.sheets.model.cellData[4][1];
    const error = await expectApiError(
      svc.updateScenario(p.id, baseline.id, { expectedRevision: 1, name: 'Baseline', notes: '', workbook: tampered, assumptions: [] }),
      422,
      'VALIDATION_ERROR',
    );
    assert.ok(error.details.fields?.['workbook.B15']);
    assert.ok(error.details.fields?.['workbook.B2']);
    assert.ok(error.details.fields?.['workbook.B5']);
    assert.ok(error.details.fields?.['workbook.B6']);
    assert.deepEqual(await svc.getProject(p.id), p);
  });

  it('ignores calculated values sent by the client', async () => {
    const { svc, p } = await demoProject();
    const baseline = p.scenarios[0];
    const forged = structuredClone(baseline.workbook) as any;
    forged.sheets.model.cellData[14][1].v = 1_000_000;
    const updated = await svc.updateScenario(p.id, baseline.id, { expectedRevision: 1, name: 'Baseline', notes: '', workbook: forged, assumptions: baseline.assumptions });
    close(updated.scenarios[0].calculation.metrics.profit, 700);
    assert.equal((updated.scenarios[0].workbook as any).sheets.model.cellData[14][1].v, 700);
  });

  it('rejects a workbook belonging to another scenario', async () => {
    const { svc, p } = await demoProject();
    const baseline = p.scenarios[0];
    const other = { ...structuredClone(baseline.workbook), id: 'wb_other' };
    await expectApiError(svc.updateScenario(p.id, baseline.id, { expectedRevision: 1, name: 'Baseline', notes: '', workbook: other, assumptions: [] }), 422, 'VALIDATION_ERROR');
  });

  it('allows negative profit and zero inputs', async () => {
    const { svc, p } = await demoProject();
    const baseline = p.scenarios[0];
    const updated = await svc.updateScenario(p.id, baseline.id, { expectedRevision: 1, name: 'Baseline', notes: '', workbook: editWorkbook(baseline, { monthlyWages: 5000, monthlyDelivery: 0 }), assumptions: [] });
    close(updated.scenarios[0].calculation.metrics.profit, -3100);
    close(updated.scenarios[0].calculation.metrics.marginFraction, -0.62);
  });
});

describe('privacy between visitors', () => {
  it('keeps each visitor’s projects to themselves', async () => {
    const db = await openDatabase(':memory:');
    const alice = new ProjectService(db, 'owner-alice');
    const bob = new ProjectService(db, 'owner-bob');
    const p = await alice.createProject({ name: 'Alice Bakery', currency: 'GBP', templateId: 'bakery-v1', initialData: 'demo' });
    assert.equal((await alice.listProjects()).length, 1);
    assert.deepEqual(await bob.listProjects(), []);
    await expectApiError(bob.getProject(p.id), 404, 'NOT_FOUND');
    await expectApiError(bob.forkScenario(p.id, { expectedRevision: p.revision, sourceScenarioId: p.baselineScenarioId, kind: 'shock', name: 'X' }), 404, 'NOT_FOUND');
    const base = p.scenarios[0];
    await expectApiError(
      bob.updateScenario(p.id, base.id, { expectedRevision: p.revision, name: base.name, notes: '', workbook: base.workbook, assumptions: base.assumptions }),
      404,
      'NOT_FOUND',
    );
    assert.equal((await alice.getProject(p.id)).revision, p.revision);
  });
});
