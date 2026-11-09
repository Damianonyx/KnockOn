import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Assumption } from '@/lib/contracts/project';
import { formatMargin, formatMoney, outcomeLabel, parseNumberInput } from '@/lib/format';
import { changedInputs, changeAgainst, confirmMonthlyUnits, orderScenarios, priceConfirmation, sameAssumptions } from '@/lib/scenarios';
import { BAKERY_DEMO_INPUTS, BAKERY_RESULTS } from '@/lib/templates/bakery';
import { formulaReferences, inspectResult, resultKeyForCell } from '@/lib/univer/inspect';
import { openDatabase } from '@/server/db';
import { ProjectService } from '@/server/projects';

describe('display formatting', () => {
  it('formats money with sign and whole units', () => {
    assert.equal(formatMoney(5000, 'GBP'), '£5,000');
    assert.equal(formatMoney(5.5, 'GBP'), '£5.50');
    assert.equal(formatMoney(0, 'GBP'), '£0');
    assert.equal(formatMoney(-200, 'GBP', { signed: true }), '−£200');
    assert.equal(formatMoney(125, 'GBP', { signed: true }), '+£125');
    assert.equal(formatMoney(null, 'GBP'), '—');
  });
  it('shows a null margin (zero revenue) as N/A', () => {
    assert.equal(formatMargin(null), 'N/A');
    assert.equal(formatMargin(0.14), '14.0%');
    assert.equal(formatMargin(-0.5), '−50.0%');
  });
  it('labels outcomes in words, not only colour', () => {
    assert.equal(outcomeLabel(-1), 'Loss');
    assert.equal(outcomeLabel(0), 'Break-even');
    assert.equal(outcomeLabel(10), 'Profit');
  });
  it('parses numeric input strictly', () => {
    assert.equal(parseNumberInput('1,250.5'), 1250.5);
    assert.equal(parseNumberInput(' 0 '), 0);
    assert.equal(parseNumberInput(''), null);
    assert.equal(parseNumberInput('12abc'), null);
    assert.equal(parseNumberInput('-3'), -3);
  });
});

describe('result inspection', () => {
  it('expands formula references, including ranges', () => {
    assert.deepEqual(formulaReferences('=SUM(B5:B9)'), ['B5', 'B6', 'B7', 'B8', 'B9']);
    assert.deepEqual(formulaReferences('=IF(B11=0,"",B15/B11)'), ['B11', 'B15']);
  });
  it('maps result cells and reports the formula, references and contributing inputs', () => {
    assert.equal(resultKeyForCell(14, 1), 'profit');
    assert.equal(resultKeyForCell(1, 1), null);
    const projection = {
      inputs: { ...BAKERY_DEMO_INPUTS },
      metrics: { revenue: 5000, ingredientCosts: 2000, fixedCosts: 2300, totalCosts: 4300, profit: 700, marginFraction: 0.14 },
    };
    const profit = inspectResult('profit', projection);
    assert.equal(profit.formula, '=B11-B14');
    assert.equal(profit.value, 700);
    assert.deepEqual(profit.references.map((r) => [r.cell, r.value]), [['B11', 5000], ['B14', 4300]]);
    assert.equal(profit.contributingInputs.length, 8);
    const fixed = inspectResult('fixedCosts', projection);
    assert.deepEqual(fixed.references.map((r) => r.cell), ['B5', 'B6', 'B7', 'B8', 'B9']);
    const margin = inspectResult('marginFraction', { ...projection, metrics: { ...projection.metrics, marginFraction: null } });
    assert.equal(margin.value, null);
  });
  it('covers every template result', () => {
    for (const r of BAKERY_RESULTS) assert.equal(inspectResult(r.key as never, { inputs: {}, metrics: {} }).cell, r.cell);
  });
});

describe('price-change confirmation rule (mirrors the server)', () => {
  const parent = { ...BAKERY_DEMO_INPUTS };
  it('is not required when the price is unchanged', () => {
    assert.deepEqual(priceConfirmation({ ...parent, monthlyUnits: 900 }, parent, []), { required: false });
    assert.deepEqual(priceConfirmation(parent, undefined, []), { required: false });
  });
  it('requires a confirmation for the exact price and units', () => {
    const current = { ...parent, unitPrice: 5.5, monthlyUnits: 950 };
    const missing = priceConfirmation(current, parent, []);
    assert.ok(missing.required && missing.status === 'missing');
    const confirmed = confirmMonthlyUnits([], 5.5, 950, '');
    const ok = priceConfirmation(current, parent, confirmed);
    assert.ok(ok.required && ok.status === 'confirmed');
    const stale = priceConfirmation({ ...current, unitPrice: 6 }, parent, confirmed);
    assert.ok(stale.required && stale.status === 'stale');
  });
  it('does not accept a demo-sourced assumption as confirmation', () => {
    const demo: Assumption[] = [{ inputKey: 'monthlyUnits', note: 'demo', source: 'demo', confirmed: true, confirmedFor: { unitPrice: 5.5, monthlyUnits: 1000 } }];
    const r = priceConfirmation({ ...parent, unitPrice: 5.5 }, parent, demo);
    assert.ok(r.required && r.status !== 'confirmed');
  });
});

describe('scenario helpers', () => {
  it('lists changed inputs against the parent', () => {
    const changes = changedInputs({ ...BAKERY_DEMO_INPUTS, monthlyEnergy: 600 }, BAKERY_DEMO_INPUTS);
    assert.deepEqual(changes.map((c) => [c.key, c.from, c.to]), [['monthlyEnergy', 400, 600]]);
    assert.deepEqual(changedInputs(BAKERY_DEMO_INPUTS, undefined), []);
  });
  it('compares saved values only when both exist', () => {
    assert.equal(changeAgainst(500, 700), -200);
    assert.equal(changeAgainst(null, 700), null);
  });
  it('compares assumption lists regardless of order', () => {
    const a = confirmMonthlyUnits([], 5, 1000, 'x');
    const b = [...a].reverse();
    assert.ok(sameAssumptions(a, b));
    assert.ok(!sameAssumptions(a, []));
  });
  it('orders baseline, then each shock followed by its responses', async () => {
    const svc = new ProjectService(await openDatabase(':memory:'));
    let p = await svc.createProject({ name: 'Order', currency: 'EUR', templateId: 'bakery-v1', initialData: 'demo' });
    p = await svc.forkScenario(p.id, { expectedRevision: p.revision, sourceScenarioId: p.baselineScenarioId, kind: 'shock', name: 'S1' });
    const s1 = p.scenarios.find((s) => s.name === 'S1')!;
    p = await svc.forkScenario(p.id, { expectedRevision: p.revision, sourceScenarioId: p.baselineScenarioId, kind: 'shock', name: 'S2' });
    p = await svc.forkScenario(p.id, { expectedRevision: p.revision, sourceScenarioId: s1.id, kind: 'response', name: 'R1' });
    assert.deepEqual(orderScenarios(p).map((s) => s.name), ['Baseline', 'S1', 'R1', 'S2']);
  });
});
