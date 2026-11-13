#!/usr/bin/env node
/** Verify real Univer report printing and licensed Excel conversion. Local service must be configured. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const base = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const dir = 'verify-results/analysis-export';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
let printDone;
let printed = new Promise((resolve) => { printDone = resolve; });
await context.exposeBinding('recordAnalysisPrint', () => printDone());
// Native printing captures Univer's print pages while window.print blocks. A mocked
// print returns at once, so keep Univer's print pages in the DOM until the test has
// rendered the live page to PDF, then fire afterprint as a browser does after its
// dialog closes. Serialising the DOM instead loses canvas pixels.
await context.addInitScript(() => {
  window.__holdPrint = false;
  const held = (node) => window.__holdPrint && node?.nodeType === 1
    && (node.classList.contains('printing-canvas-container') || node.classList.contains('offline-printing-css'));
  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (node) { return held(node) ? node : removeChild.call(this, node); };
  const remove = Element.prototype.remove;
  Element.prototype.remove = function () { return held(this) ? undefined : remove.call(this); };
  window.print = () => { window.__holdPrint = true; void window.recordAnalysisPrint(); };
});
async function finishPrint(target) {
  await target.evaluate(() => {
    // Univer's own afterprint handler removes its print pages and closes the preview.
    window.__holdPrint = false;
    window.dispatchEvent(new Event('afterprint'));
  });
  printed = new Promise((resolve) => { printDone = resolve; });
}
const errors = [];
// page.pdf() lays out the live page with print media (a real print uses a separate
// print document), so Univer's preview list sees a resize and its ResizeObserver can
// fire after the preview closes. Tolerate exactly that error, only while capturing.
let capturingPdf = false;
const captureArtifact = (e) => capturingPdf && /reading 'clientWidth'/.test(e.message) && /ResizeObserver/.test(e.stack || '');
context.on('page', (p) => p.on('pageerror', (e) => { if (!captureArtifact(e)) errors.push(`[after: ${stage}] ${p.url().replace(base, '').split('?')[0]}: ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`); }));
const page = await context.newPage();
let stage = 'start';
const pass = (message) => { console.log(`PASS ${message}`); stage = message; };
try {
  await page.goto(`${base}/projects`);
  await page.getByLabel('Project name').fill('Export verification');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.waitForURL(/\/projects\//, { timeout: 60_000 });
  const ready = async () => page.waitForFunction(() => document.querySelector('.sheet-host canvas') && !document.querySelector('.sheet-host .sheet-overlay'), null, { timeout: 60_000 });
  await ready();
  await page.getByRole('button', { name: '+ Add a shock', exact: true }).click();
  await page.locator('#fork-monthlyEnergy').fill('600');
  await page.getByRole('button', { name: 'Add shock', exact: true }).click();
  await page.getByRole('heading', { name: 'Energy £600/month', exact: true }).waitFor();
  await ready();
  const projectId = new URL(page.url()).pathname.split('/').pop();
  const apiUrl = `${base}/api/projects/${projectId}`;
  const saved = async () => (await (await page.request.get(apiUrl)).json()).data;
  // Adding a shock is a fork (one revision) then a save of the new energy cost (another).
  // Wait for the second so the test never races the app's own save.
  await page.waitForSelector('.save-btn[data-state="saved"]', { timeout: 60_000 });
  let before;
  for (let i = 0; i < 40; i++) {
    before = await saved();
    if (before.scenarios.find((s) => s.kind === 'shock')?.calculation.inputs.monthlyEnergy === 600) break;
    await page.waitForTimeout(250);
  }
  const shock = before.scenarios.find((s) => s.kind === 'shock');
  assert.equal(shock.calculation.inputs.monthlyEnergy, 600);
  await page.getByLabel('Minimum monthly sales (units)', { exact: true }).fill('500');
  await page.getByLabel('Maximum monthly sales (units)', { exact: true }).fill('1500');
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await page.getByRole('group', { name: 'Break-even by scenario' }).waitFor();
  const request = { expectedRevision: before.revision, scenarioId: shock.id, minUnits: 500, maxUnits: 1500 };
  const reportResponse = await page.request.post(`${apiUrl}/analysis/report`, { data: request });
  assert.equal(reportResponse.status(), 200, await reportResponse.text());
  const report = (await reportResponse.json()).data;
  fs.writeFileSync(`${dir}/report-workbook.json`, JSON.stringify(report.workbook));
  assert.equal(report.workbook.sheetOrder[0], 'report');
  // Univer 1.4.0 prints worksheet charts as empty frames, so the printable report has none (Excel keeps it).
  const chartData = report.workbook.resources?.find((r) => r.name === 'SHEET_CHART_PLUGIN')?.data;
  assert.ok(!chartData || !JSON.parse(chartData).report?.length);
  assert.match(JSON.stringify(report.workbook.sheets.report.cellData), /adds a line chart of these figures/);
  pass('report API returns the selected saved revision and formulas; the printable report states the chart is in Excel');

  if (process.env.E2E_EXPORT_UNAVAILABLE === '1') {
    assert.equal(await page.getByRole('button', { name: 'Export analysis Excel', exact: true }).isDisabled(), true);
    assert.equal((await page.request.post(`${apiUrl}/analysis/export`, { data: request })).status(), 503);
    pass('unconfigured Excel export is clearly unavailable while PDF remains accessible');
  } else {
    const downloadPromise = page.waitForEvent('download', { timeout: 65_000 });
    await page.getByRole('button', { name: 'Export analysis Excel', exact: true }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /Energy-600month-analysis-r\d+\.xlsx$/);
    await download.saveAs(`${dir}/analysis.xlsx`);
    assert.equal(fs.readFileSync(`${dir}/analysis.xlsx`).subarray(0, 2).toString(), 'PK');
    pass('Excel button downloads a real licensed analysis workbook');
  }

  const opened = context.waitForEvent('page');
  await page.getByRole('link', { name: /Print analysis \/ PDF/ }).click();
  const preview = await opened;
  await preview.getByRole('button', { name: 'NEXT', exact: true }).waitFor({ timeout: 60_000 });
  assert.equal(await preview.locator('[data-report-ready="true"]').count(), 1);
  // Next's empty route announcer also has role=alert; inspect the report's visible error paragraph.
  assert.deepEqual(await preview.locator('p[role="alert"]').allTextContents(), []);
  await preview.screenshot({ path: `${dir}/print-preview.png`, fullPage: true });
  await preview.getByRole('button', { name: 'NEXT', exact: true }).click();
  let timer;
  try { await Promise.race([printed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('No browser print request')), 30_000); })]); }
  finally { clearTimeout(timer); }
  const pages = await preview.locator('.printing-canvas-container canvas').count();
  assert.ok(pages >= 2, `expected report pages, got ${pages}`);
  capturingPdf = true;
  await preview.pdf({ path: `${dir}/analysis.pdf`, printBackground: true, preferCSSPageSize: true });
  await finishPrint(preview);
  await preview.waitForTimeout(500);
  capturingPdf = false;
  assert.equal(fs.readFileSync(`${dir}/analysis.pdf`).subarray(0, 4).toString(), '%PDF');
  assert.ok(fs.statSync(`${dir}/analysis.pdf`).size > 20_000, 'PDF must contain the rendered report pages, not blank pages');
  await preview.getByRole('button', { name: 'NEXT', exact: true }).waitFor({ state: 'hidden' });
  pass('Univer preview passes rendered report pages to native print / Save as PDF');
  assert.deepEqual(await saved(), before);
  pass('printing and exporting leave the baseline, inputs, assumptions and revision unchanged');

  // Reopen after printing (the preview closed on afterprint), on a phone, then cancel.
  await preview.setViewportSize({ width: 390, height: 844 });
  await preview.getByRole('button', { name: 'Print / PDF', exact: true }).click();
  const next = preview.getByRole('button', { name: 'NEXT', exact: true });
  await next.waitFor();
  const box = await next.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  await preview.screenshot({ path: `${dir}/mobile-print-preview.png` });
  await preview.getByRole('button', { name: 'CANCEL', exact: true }).click();
  await next.waitFor({ state: 'hidden' });
  // Reopen once more after cancelling: nothing may be left covering the page.
  await preview.getByRole('button', { name: 'Print / PDF', exact: true }).click();
  await next.waitFor();
  await preview.getByRole('button', { name: 'CANCEL', exact: true }).click();
  assert.equal(await preview.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  pass('print reopens after printing and after cancelling, and fits a phone');

  const stranger = await browser.newContext();
  for (const suffix of ['report', 'export']) {
    assert.equal((await stranger.request.post(`${apiUrl}/analysis/${suffix}`, { data: request })).status(), 404);
    assert.equal((await page.request.post(`${apiUrl}/analysis/${suffix}`, { data: { ...request, expectedRevision: 1 } })).status(), 409);
    assert.equal((await page.request.post(`${apiUrl}/analysis/${suffix}`, { data: { ...request, minUnits: -1 } })).status(), 400);
  }
  await stranger.close();
  pass('both report endpoints reject strangers, stale revisions and invalid ranges');
  await page.getByLabel('Maximum monthly sales (units)', { exact: true }).fill('1600');
  assert.equal(await page.getByRole('link', { name: /Print analysis \/ PDF/ }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Export analysis Excel', exact: true }).count(), 0);
  pass('changing the range removes export controls until the analysis is rerun');
  assert.deepEqual(errors, []);
  pass('no browser runtime errors');
} catch (error) {
  await page.screenshot({ path: `${dir}/failure.png`, fullPage: true }).catch(() => {});
  console.error(error); if (errors.length) console.error(errors);
  process.exitCode = 1;
} finally { await browser.close(); }
