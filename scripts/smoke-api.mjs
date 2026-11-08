#!/usr/bin/env node
/**
 * End-to-end API check against a running server (npm run dev / npm start).
 *
 *   npm run smoke:api                       # run the bakery workflow
 *   SMOKE_VERIFY_PROJECT=proj_… npm run smoke:api   # after a restart: check it persisted
 *
 * BASE_URL defaults to http://localhost:3000. Creates a demo project in the
 * configured database.
 */
const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

async function call(method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, json };
}

let failures = 0;
function check(label, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${!condition && detail ? `  (${detail})` : ''}`);
  if (!condition) failures++;
}
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-9;

const INPUT_CELLS = { monthlyUnits: [1, 1], unitPrice: [2, 1], ingredientCostPerUnit: [3, 1], monthlyEnergy: [4, 1], monthlyDelivery: [8, 1] };
function edit(scenario, changes) {
  const workbook = structuredClone(scenario.workbook);
  for (const [key, value] of Object.entries(changes)) {
    const [row, col] = INPUT_CELLS[key];
    workbook.sheets.model.cellData[row][col] = { v: value, t: 2 };
  }
  return workbook;
}
const byName = (project, name) => project.scenarios.find((s) => s.name === name);

const EXPECTED = {
  Baseline: [5000, 4300, 700],
  'Energy shock': [5000, 4500, 500],
  'Raise price': [5225, 4400, 825],
  'Switch supplier': [5000, 4400, 600],
};
function checkFixtures(project, prefix) {
  for (const [name, [revenue, totalCosts, profit]] of Object.entries(EXPECTED)) {
    const m = byName(project, name)?.calculation.metrics ?? {};
    check(`${prefix}${name}: revenue ${revenue}, costs ${totalCosts}, profit ${profit}`, near(m.revenue, revenue) && near(m.totalCosts, totalCosts) && near(m.profit, profit), JSON.stringify(m));
  }
}

async function verifyPersisted(projectId) {
  const { status, json } = await call('GET', `/api/projects/${projectId}`);
  check('project reloads after restart', status === 200, `HTTP ${status}`);
  if (status !== 200) return;
  checkFixtures(json.data, 'after restart: ');
  const formula = json.data.scenarios[0].workbook.sheets.model.cellData[10][1].f;
  check('formulas intact after restart', formula === '=B2*B3', formula);
}

async function workflow() {
  const templates = await call('GET', '/api/templates');
  check('GET /api/templates', templates.status === 200 && templates.json.data[0]?.id === 'bakery-v1');

  const created = await call('POST', '/api/projects', { name: 'Smoke test bakery', currency: 'gbp', templateId: 'bakery-v1', initialData: 'demo' });
  check('POST /api/projects → 201', created.status === 201, JSON.stringify(created.json));
  let p = created.json.data;
  check('currency normalised to GBP', p.currency === 'GBP');

  let r = await call('POST', `/api/projects/${p.id}/scenarios`, { expectedRevision: p.revision, sourceScenarioId: p.baselineScenarioId, kind: 'shock', name: 'Energy shock' });
  check('fork shock → 201 and baseline frozen', r.status === 201 && r.json.data.baselineFrozen === true);
  p = r.json.data;
  const shock = byName(p, 'Energy shock');
  r = await call('PUT', `/api/projects/${p.id}/scenarios/${shock.id}`, { expectedRevision: p.revision, name: shock.name, notes: '', workbook: edit(shock, { monthlyEnergy: 600 }), assumptions: shock.assumptions });
  check('save shock → 200', r.status === 200, JSON.stringify(r.json));
  p = r.json.data;

  r = await call('POST', `/api/projects/${p.id}/scenarios`, { expectedRevision: p.revision, sourceScenarioId: shock.id, kind: 'response', name: 'Raise price' });
  p = r.json.data;
  const price = byName(p, 'Raise price');
  r = await call('PUT', `/api/projects/${p.id}/scenarios/${price.id}`, { expectedRevision: p.revision, name: price.name, notes: '', workbook: edit(price, { unitPrice: 5.5, monthlyUnits: 950 }), assumptions: price.assumptions });
  check('price change without confirmed sales → 422 ASSUMPTION_REQUIRED', r.status === 422 && r.json.error?.code === 'ASSUMPTION_REQUIRED', JSON.stringify(r.json));
  const assumptions = [
    ...price.assumptions.filter((a) => a.inputKey !== 'monthlyUnits'),
    { inputKey: 'monthlyUnits', note: 'Expect slightly fewer sales.', source: 'user', confirmed: true, confirmedFor: { unitPrice: 5.5, monthlyUnits: 950 } },
  ];
  r = await call('PUT', `/api/projects/${p.id}/scenarios/${price.id}`, { expectedRevision: p.revision, name: price.name, notes: '', workbook: edit(price, { unitPrice: 5.5, monthlyUnits: 950 }), assumptions });
  check('price change with confirmed sales → 200', r.status === 200, JSON.stringify(r.json));
  p = r.json.data;

  r = await call('POST', `/api/projects/${p.id}/scenarios`, { expectedRevision: p.revision, sourceScenarioId: shock.id, kind: 'response', name: 'Switch supplier' });
  p = r.json.data;
  const supplier = byName(p, 'Switch supplier');
  r = await call('PUT', `/api/projects/${p.id}/scenarios/${supplier.id}`, { expectedRevision: p.revision, name: supplier.name, notes: '', workbook: edit(supplier, { ingredientCostPerUnit: 1.8, monthlyDelivery: 100 }), assumptions: supplier.assumptions });
  p = r.json.data;
  checkFixtures(p, '');

  // Error responses.
  r = await call('PUT', `/api/projects/${p.id}/scenarios/${supplier.id}`, { expectedRevision: 1, name: supplier.name, notes: '', workbook: byName(p, 'Switch supplier').workbook, assumptions: [] });
  check('stale revision → 409 REVISION_CONFLICT with currentRevision', r.status === 409 && r.json.error?.currentRevision === p.revision, JSON.stringify(r.json));
  const baseline = byName(p, 'Baseline');
  r = await call('PUT', `/api/projects/${p.id}/scenarios/${baseline.id}`, { expectedRevision: p.revision, name: 'Baseline', notes: '', workbook: baseline.workbook, assumptions: baseline.assumptions });
  check('write to frozen baseline → 409 BASELINE_FROZEN', r.status === 409 && r.json.error?.code === 'BASELINE_FROZEN');
  const tampered = structuredClone(byName(p, 'Switch supplier').workbook);
  tampered.sheets.model.cellData[14][1] = { f: '=B11' };
  r = await call('PUT', `/api/projects/${p.id}/scenarios/${supplier.id}`, { expectedRevision: p.revision, name: supplier.name, notes: '', workbook: tampered, assumptions: [] });
  check('edited formula → 422 VALIDATION_ERROR on B15', r.status === 422 && Boolean(r.json.error?.fields?.['workbook.B15']), JSON.stringify(r.json));
  r = await call('POST', '/api/projects', '{not json');
  check('malformed JSON → 400', r.status === 400 && r.json.error?.code === 'BAD_REQUEST');
  r = await call('POST', '/api/projects', { name: '', currency: 'pounds', templateId: 'bakery-v1', initialData: 'demo' });
  check('invalid fields → 400 with field messages', r.status === 400 && Boolean(r.json.error?.fields?.name) && Boolean(r.json.error?.fields?.currency));
  r = await call('GET', '/api/projects/proj_missing');
  check('missing project → 404', r.status === 404 && r.json.error?.code === 'NOT_FOUND');
  r = await call('GET', '/api/projects');
  check('GET /api/projects lists the project first', r.status === 200 && r.json.data[0]?.id === p.id);

  console.log(`\nProject id: ${p.id}`);
  return p.id;
}

if (process.env.SMOKE_VERIFY_PROJECT) {
  await verifyPersisted(process.env.SMOKE_VERIFY_PROJECT);
} else {
  await workflow();
}
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
