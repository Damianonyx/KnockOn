#!/usr/bin/env node
/** Local browser → API → saved inputs → real Univer → analysis UI verification. No Ling calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const base = (process.env.BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const dir = 'verify-results/analysis';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const pass = (label) => console.log(`PASS ${label}`);
async function ready() {
  await page.waitForFunction(() => document.querySelector('.sheet-host canvas') && !document.querySelector('.sheet-host .sheet-overlay'), null, { timeout: 60_000 });
}
async function run() {
  const response = page.waitForResponse((r) => r.url().endsWith('/analysis') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  const result = await response;
  assert.equal(result.status(), 200, await result.text());
  await page.getByRole('group', { name: 'Break-even by scenario' }).waitFor();
  return (await result.json()).data;
}
try {
  await page.goto(`${base}/projects`);
  await page.getByLabel('Project name').fill('Break-even verification');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.waitForURL(/\/projects\//, { timeout: 60_000 });
  await ready();
  const id = new URL(page.url()).pathname.split('/').pop();
  const url = `${base}/api/projects/${id}`;
  const saved = async () => (await (await page.request.get(url)).json()).data;
  const first = await saved();
  await page.getByRole('link', { name: 'Break-even & sensitivity', exact: true }).click();
  await page.getByLabel('Minimum monthly sales (units)', { exact: true }).fill('500');
  await page.getByLabel('Maximum monthly sales (units)', { exact: true }).fill('1500');
  let analysis = await run();
  assert.equal(analysis.scenarios[0].breakEvenUnits, 767);
  assert.equal(analysis.scenarios[0].points.find((p) => p.units === 1000).profit, 700);
  assert.deepEqual(await saved(), first);
  pass('saved inputs produce a real Univer threshold and sensitivity without changing the project');

  await page.getByRole('button', { name: '+ Add a shock', exact: true }).click();
  await page.locator('#fork-monthlyEnergy').fill('600');
  await page.getByRole('button', { name: 'Add shock', exact: true }).click();
  await page.getByRole('heading', { name: 'Energy £600/month', exact: true }).waitFor();
  await ready();
  assert.equal(await page.getByRole('group', { name: 'Break-even by scenario' }).count(), 0);
  await page.getByText('The saved project or sales range changed.', { exact: false }).waitFor();
  analysis = await run();
  assert.deepEqual(analysis.scenarios.map((s) => s.breakEvenUnits), [767, 834]);
  const group = page.getByRole('group', { name: 'Break-even by scenario' });
  assert.equal(await group.getByRole('button', { name: /Energy/ }).getAttribute('aria-pressed'), 'true');
  pass('new revisions hide old analysis; baseline and energy shock show different thresholds');

  await page.getByRole('button', { name: 'Inspect profit at 1,000 units', exact: true }).click();
  await page.getByRole('heading', { name: '1,000 hypothetical units per month', exact: true }).waitFor();
  assert.match(await page.locator('#analysis details').innerText(), /D29 =B29-C29/);
  assert.match(await page.locator('#analysis details').innerText(), /Profit: £500/);
  await page.getByRole('button', { name: 'Inspect break-even', exact: true }).click();
  assert.match(await page.locator('#analysis details').innerText(), /B19 =IF\(B18>0,ROUNDUP/);
  pass('chart/table results and break-even expose formulas and contributing inputs');

  await page.getByLabel('Maximum monthly sales (units)', { exact: true }).fill('400');
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Maximum must be greater' }).waitFor();
  assert.equal(await group.count(), 0);
  await page.getByLabel('Maximum monthly sales (units)', { exact: true }).fill('1500');
  await run();
  pass('invalid and changed ranges cannot display misleading old results');

  const project = await saved();
  const request = { expectedRevision: project.revision, minUnits: 500, maxUnits: 1500 };
  assert.equal((await page.request.post(`${url}/analysis`, { data: { ...request, expectedRevision: 1 } })).status(), 409);
  assert.equal((await page.request.post(`${url}/analysis`, { data: { ...request, minUnits: -1 } })).status(), 400);
  const stranger = await browser.newContext();
  assert.equal((await stranger.request.post(`${url}/analysis`, { data: request })).status(), 404);
  await stranger.close();
  pass('API rejects stale revisions, invalid ranges and other visitors');

  await page.locator('#analysis').screenshot({ path: `${dir}/desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#analysis').scrollIntoViewIfNeeded();
  await group.getByRole('button', { name: /Baseline/ }).click();
  await page.locator('#analysis svg circle[role="button"]').first().focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: '500 hypothetical units per month', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  await page.locator('#analysis').screenshot({ path: `${dir}/mobile.png` });
  pass('phone layout fits and chart points work from the keyboard');
  assert.deepEqual(errors, []);
  pass('no browser runtime errors');
} catch (error) {
  await page.screenshot({ path: `${dir}/failure.png`, fullPage: true }).catch(() => {});
  console.error(error); if (errors.length) console.error(errors);
  process.exitCode = 1;
} finally { await browser.close(); }
