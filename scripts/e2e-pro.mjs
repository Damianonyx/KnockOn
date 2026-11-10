#!/usr/bin/env node
/** Verify licensed charts, worksheet printing and real Excel downloads against a running app.
 * Creates a visitor-owned demo project; uses no Ling credits. Both license variables must be configured.
 * BASE_URL=http://localhost:3100 CHROMIUM_PATH=/usr/bin/chromium npm run e2e:pro
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const dir = path.resolve('verify-results');
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
let printRequests = 0;
await context.exposeBinding('recordPrintRequest', () => { printRequests++; });
await context.addInitScript(() => {
  // Observe the native print boundary in every frame without opening an OS dialog in CI.
  window.print = () => { void window.recordPrintRequest(); };
});
const errors = [];
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
const pass = (label) => console.log(`PASS  ${label}`);

async function ready() {
  await page.waitForSelector('.sheet-host canvas', { timeout: 60_000 });
  await page.waitForFunction(() => !document.querySelector('.sheet-host .sheet-overlay'), null, { timeout: 60_000 });
}
async function saved() {
  await page.waitForFunction(() => document.querySelector('.save-btn')?.getAttribute('data-state') === 'saved', null, { timeout: 30_000 });
}
const chartData = (scenario) => JSON.parse(scenario.workbook.resources.find((r) => r.name === 'SHEET_CHART_PLUGIN').data).model;

try {
  await page.goto(`${base}/projects`);
  await page.getByLabel('Project name').fill('Pro feature verification');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.waitForURL(/\/projects\//, { timeout: 60_000 });
  await ready();
  const projectId = new URL(page.url()).pathname.split('/').pop();
  const projectUrl = `${base}/api/projects/${projectId}`;
  const project = async () => (await (await page.request.get(projectUrl)).json()).data;

  await page.getByRole('button', { name: 'Add overhead chart', exact: true }).click();
  await page.getByRole('button', { name: 'Show chart', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Export Excel', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await saved();
  let p = await project();
  assert.equal(chartData(p.scenarios[0]).length, 1);
  pass('a real Univer chart saves with its scenario; unsaved Excel export is disabled');

  await page.reload();
  await ready();
  await saved();
  await page.getByRole('button', { name: 'Show chart', exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, 'univer-pro-chart.png'), fullPage: true });
  pass('chart restores after reload without marking the scenario unsaved');

  await page.getByRole('button', { name: '+ Add a shock', exact: true }).click();
  await page.locator('#fork-monthlyEnergy').fill('600');
  await page.getByRole('button', { name: 'Add shock', exact: true }).click();
  await page.getByRole('heading', { name: 'Energy £600/month', exact: true }).waitFor({ timeout: 30_000 });
  await ready();
  await saved();
  p = await project();
  const shock = p.scenarios.find((s) => s.kind === 'shock');
  const baseline = p.scenarios.find((s) => s.kind === 'baseline');
  assert.equal(chartData(shock)[0].rangeInfo.rangeInfo.unitId, shock.workbook.id);
  assert.equal(shock.calculation.metrics.profit, 500);
  assert.equal(baseline.calculation.metrics.profit, 700);
  await page.getByRole('button', { name: 'Show chart', exact: true }).click();
  await page.screenshot({ path: path.join(dir, 'univer-pro-shock.png'), fullPage: true });
  pass('copied chart points at the shock workbook; baseline figures stay unchanged');

  const downloadPromise = page.waitForEvent('download', { timeout: 65_000 });
  await page.getByRole('button', { name: 'Export Excel', exact: true }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /Energy-600month-r\d+\.xlsx$/);
  const file = path.join(dir, 'univer-pro-scenario.xlsx');
  await download.saveAs(file);
  assert.equal(fs.readFileSync(file).subarray(0, 2).toString(), 'PK');
  pass('Excel button downloads an XLSX workbook from the licensed server converter');

  const exportUrl = `${projectUrl}/scenarios/${shock.id}/export`;
  assert.equal((await page.request.post(exportUrl, { data: { expectedRevision: 1 } })).status(), 409);
  const stranger = await browser.newContext();
  assert.equal((await stranger.request.post(exportUrl, { data: { expectedRevision: p.revision } })).status(), 404);
  await stranger.close();
  pass('export API rejects stale revisions and a different visitor');

  await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
  await page.getByRole('button', { name: 'NEXT', exact: true }).waitFor();
  assert.equal(await page.locator('.scenario-tools-error').count(), 0);
  await page.screenshot({ path: path.join(dir, 'univer-pro-print.png'), fullPage: true });
  await page.getByRole('button', { name: 'CANCEL', exact: true }).click();
  pass('Univer print preview opens and closes without an SDK error');
  await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
  await page.getByRole('button', { name: 'NEXT', exact: true }).click();
  for (let attempt = 0; attempt < 100 && printRequests === 0; attempt++) await page.waitForTimeout(100);
  assert.ok(printRequests > 0, 'NEXT must send the generated worksheet to browser printing');
  pass('NEXT hands the generated worksheet to browser printing / Save as PDF');

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  mobile.on('pageerror', (error) => errors.push(error.message));
  await mobile.goto(page.url());
  await mobile.waitForFunction(() => document.querySelector('.sheet-host canvas') && !document.querySelector('.sheet-host .sheet-overlay'), null, { timeout: 60_000 });
  await mobile.getByRole('button', { name: 'Show chart', exact: true }).click();
  await mobile.screenshot({ path: path.join(dir, 'univer-pro-mobile.png'), fullPage: true });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  pass('worksheet tools and chart fit a phone viewport');
  await mobile.close();

  assert.deepEqual(errors, []);
  pass('no browser runtime errors');
  console.log(`Artifacts: ${dir}`);
} catch (error) {
  await page.screenshot({ path: path.join(dir, 'univer-pro-failure.png'), fullPage: true }).catch(() => {});
  console.error(error);
  if (errors.length) console.error('Browser errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
