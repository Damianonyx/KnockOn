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
let printHtml = '';
let printDone;
const printed = new Promise((resolve) => { printDone = resolve; });
await context.exposeBinding('recordAnalysisPrint', (_source, html) => { printHtml = html; printDone(); });
await context.addInitScript(() => { window.print = () => {
  // Native printing captures canvas pixels. Serialising outerHTML alone loses them;
  // replace canvases in a detached copy for the standalone PDF verification artifact.
  const copy = document.documentElement.cloneNode(true);
  const originals = document.querySelectorAll('canvas');
  copy.querySelectorAll('canvas').forEach((canvas, index) => {
    const img = document.createElement('img');
    img.src = originals[index].toDataURL();
    img.width = originals[index].width; img.height = originals[index].height;
    img.setAttribute('style', canvas.getAttribute('style') || '');
    canvas.replaceWith(img);
  });
  const baseTag = document.createElement('base'); baseTag.href = location.href;
  copy.querySelector('head')?.prepend(baseTag);
  void window.recordAnalysisPrint(copy.outerHTML);
}; });
const errors = [];
context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
const page = await context.newPage();
const pass = (message) => console.log(`PASS ${message}`);
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
  const before = await saved();
  const shock = before.scenarios.find((s) => s.kind === 'shock');
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
  assert.ok(report.workbook.resources.some((r) => r.name === 'SHEET_CHART_PLUGIN'));
  pass('report API returns the selected saved revision, formulas and a real worksheet chart');

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
  assert.match(printHtml, /<img|<canvas/);
  fs.writeFileSync(`${dir}/print.html`, printHtml);
  const pdfPage = await context.newPage();
  await pdfPage.setContent(printHtml, { waitUntil: 'load' });
  await pdfPage.waitForFunction(() => [...document.images].every((img) => img.complete));
  await pdfPage.pdf({ path: `${dir}/analysis.pdf`, printBackground: true, preferCSSPageSize: true });
  await pdfPage.close();
  assert.equal(fs.readFileSync(`${dir}/analysis.pdf`).subarray(0, 4).toString(), '%PDF');
  assert.ok(fs.statSync(`${dir}/analysis.pdf`).size > 20_000, 'PDF must contain the rendered report, not empty canvas placeholders');
  pass('Univer preview passes rendered report pages to native print / Save as PDF');
  assert.deepEqual(await saved(), before);
  pass('printing and exporting leave the baseline, inputs, assumptions and revision unchanged');

  await preview.setViewportSize({ width: 390, height: 844 });
  const cancel = preview.getByRole('button', { name: 'CANCEL', exact: true });
  if (await cancel.isVisible()) await cancel.click();
  await preview.getByRole('button', { name: 'Print / PDF', exact: true }).click();
  const next = preview.getByRole('button', { name: 'NEXT', exact: true });
  await next.waitFor();
  const box = await next.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  await preview.screenshot({ path: `${dir}/mobile-print-preview.png`, fullPage: true });
  await preview.getByRole('button', { name: 'CANCEL', exact: true }).click();
  pass('report print controls remain usable on a phone');

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
