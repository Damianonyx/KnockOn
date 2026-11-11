import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createExportServer } from './server.mjs';

const token = 'test-token-'.repeat(5);
const workbook = { id: 'test', sheetOrder: ['model'], sheets: { model: {} } };

async function fixture(t, convert) {
  const server = createExportServer({ token, convert, logger: () => {} });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/v1/export/xlsx`;
  return (body = { workbook }, overrides = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body), ...overrides });
}

test('authenticates and validates before licensed work, then returns the converter bytes', async (t) => {
  let calls = 0;
  const post = await fixture(t, async (value) => { calls++; assert.deepEqual(value, workbook); return Buffer.from('PK-test'); });
  assert.equal((await post(undefined, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await post({ workbook: null })).status, 400);
  assert.equal((await post({ workbook, extra: 'ignored?' })).status, 400);
  assert.equal((await post({ workbook, padding: 'x'.repeat(1_048_576) })).status, 413);
  assert.equal(calls, 0);
  const result = await post();
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.match(result.headers.get('content-type'), /spreadsheetml.sheet/);
  assert.equal(await result.text(), 'PK-test');
  assert.equal(calls, 1);
});

test('rejects overlapping exports without retrying or consuming another conversion', async (t) => {
  let finish;
  let began;
  const started = new Promise((resolve) => { began = resolve; });
  let calls = 0;
  const post = await fixture(t, () => { calls++; began(); return new Promise((resolve) => { finish = resolve; }); });
  const first = post();
  await started;
  assert.equal((await post()).status, 503);
  finish(Buffer.from('PK-test'));
  assert.equal((await first).status, 200);
  assert.equal(calls, 1);
});

test('keeps license diagnostics private and returns unavailable without a retry', async (t) => {
  let calls = 0;
  const post = await fixture(t, async () => { calls++; throw Object.assign(new Error('private diagnostic'), { code: 'LICENSE_USAGE_STORAGE_ERROR' }); });
  const result = await post();
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { error: { code: 'EXPORT_UNAVAILABLE' } });
  assert.equal(calls, 1);
});
