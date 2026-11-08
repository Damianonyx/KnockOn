#!/usr/bin/env node
/**
 * Browser end-to-end check of the full bakery workflow against a running app
 * (npm run dev / npm start), using the real Univer spreadsheet and API:
 * create → edit in sheet and controls → save → shock → price and supplier
 * responses → frozen baseline → inspect → compare → reload, plus validation,
 * zero revenue, negative profit, unsaved-switch prompt, network failure, save
 * conflict, and phone layout.
 *
 *   npm run e2e                         # http://localhost:3000
 *   BASE_URL=http://localhost:3100 npm run e2e
 *   E2E_SCREENSHOTS=1 npm run e2e        # also save screenshots to verify-results/
 *   E2E_HEADED=1 npm run e2e             # watch it run
 *
 * Creates a demo project ("E2E Bakery") in the configured database. Needs a
 * Chromium for Playwright; on a fresh machine run `npx playwright install chromium`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const shotDir = process.env.E2E_SCREENSHOTS ? path.resolve('verify-results') : null;
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
const shot = (page, name, opts = {}) => (shotDir ? page.screenshot({ path: path.join(shotDir, `${name}.png`), ...opts }) : Promise.resolve());
let failures = 0;
const check = (label, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && detail ? `  (${detail})` : ''}`); if (!cond) failures++; };

async function metrics(page) { return (await page.locator('.metrics').innerText()).replace(/\s+/g, ' '); }
async function saveState(page) { return (await page.locator('.save-state').innerText()).trim(); }
async function ready(page) {
  await page.waitForSelector('.sheet-host canvas', { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('.sheet-host .sheet-overlay'), null, { timeout: 60000 });
  await page.waitForTimeout(800);
}
async function cellPoint(page, row, col) {
  const box = await page.locator('.sheet-host').boundingBox();
  // Row header 46px wide; formula bar + column header ~ 50px; rows 24px; col A 230, col B 120.
  const x = box.x + 46 + (col === 0 ? 115 : 230 + 60);
  const y = box.y + 62 + (row - 1) * 24;
  return { x, y };
}
async function typeInCell(page, row, col, text) {
  const p = await cellPoint(page, row, col);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
}
async function waitSaved(page) {
  await page.waitForFunction(() => document.querySelector('.save-state')?.textContent?.includes('Saved'), null, { timeout: 30000 });
}

(async () => {
  const browser = await chromium.launch({ headless: !process.env.E2E_HEADED });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

  // 1. Create
  try {
    await fetch(`${BASE}/api/templates`);
  } catch {
    console.error(`Cannot reach ${BASE}. Start the app first (npm run dev or npm start), or set BASE_URL.`);
    process.exit(1);
  }
  // 0. Landing page: hero, intro animation, and Open app link
  await page.goto(`${BASE}/`);
  check('landing headline', await page.getByRole('heading', { name: 'Meet Knock-On,' }).isVisible());
  await page.waitForFunction(() => document.querySelector('[data-state]')?.getAttribute('data-state') === 'done', null, { timeout: 15000 });
  check('landing intro finishes', true);
  await shot(page, 'landing', { fullPage: true });
  await page.getByRole('main').getByRole('link', { name: 'Open app' }).first().click();
  await page.waitForURL(/\/projects$/);
  check('Open app goes to the app', page.url().endsWith('/projects'));

  await page.goto(`${BASE}/projects`);
  await page.getByLabel('Project name').fill('E2E Bakery');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/projects\//);
  await ready(page);
  check('demo label shown', await page.getByText('Fictional demo figures', { exact: true }).isVisible());
  let m = await metrics(page);
  check('baseline fixture', m.includes('£5,000') && m.includes('£4,300') && m.includes('£700') && m.includes('14.0%'), m);

  // 2. Edit in the sheet
  await typeInCell(page, 5, 1, '450');
  m = await metrics(page);
  check('sheet edit recalculates total costs', m.includes('£4,350') && m.includes('£650'), m);
  check('unsaved state', (await saveState(page)).includes('Unsaved'));
  check('control follows sheet', (await page.locator('#input-monthlyEnergy').inputValue()) === '450');
  // Edit via control
  await page.locator('#input-monthlyEnergy').fill('400');
  await page.locator('#input-monthlyEnergy').press('Enter');
  await page.waitForTimeout(1200);
  m = await metrics(page);
  check('control edit recalculates', m.includes('£4,300') && m.includes('£700'), m);
  await shot(page, 'edit');
  // Blocked formula cell edit
  await typeInCell(page, 11, 1, '123');
  check('formula cell edit blocked', await page.locator('.toast').isVisible().catch(() => false));
  m = await metrics(page);
  check('formula intact after blocked edit', m.includes('£5,000'), m);
  // Validation: negative in control
  await page.locator('#input-monthlyRent').fill('-5');
  await page.locator('#input-monthlyRent').press('Enter');
  check('negative input rejected', await page.getByText('Must be zero or more.').isVisible());
  await page.locator('#input-monthlyRent').press('Escape');
  await page.locator('#input-monthlyRent').blur();
  // Save
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitSaved(page);
  check('baseline saved', (await saveState(page)).includes('Saved'));

  // 3. Shock
  await page.getByRole('button', { name: '+ Shock from baseline' }).click();
  check('freeze warning shown', await page.getByText('This freezes the baseline.').isVisible());
  await page.locator('#fork-monthlyEnergy').fill('600');
  await page.getByRole('button', { name: 'Create shock' }).click();
  await page.waitForSelector('.dialog', { state: 'detached' });
  await waitSaved(page);
  await ready(page);
  m = await metrics(page);
  check('shock fixture', m.includes('£4,500') && m.includes('£500') && m.includes('−£200'), m);

  // 4. Price response
  await page.getByRole('button', { name: /\+ Response to/ }).click();
  await page.getByLabel('Change the price').check();
  await page.locator('#fork-unitPrice').fill('5.5');
  await page.locator('#fork-monthlyUnits').fill('950');
  await page.getByRole('button', { name: 'Create response' }).click();
  await page.waitForSelector('.dialog', { state: 'detached' });
  await waitSaved(page);
  await ready(page);
  m = await metrics(page);
  check('price response fixture', m.includes('£5,225') && m.includes('£4,400') && m.includes('£825') && m.includes('+£125'), m);
  check('sales confirmed shown', await page.getByText('Expected sales confirmed').isVisible());

  // Price change without confirmation is not saved
  await page.locator('#input-unitPrice').fill('6');
  await page.locator('#input-unitPrice').press('Enter');
  await page.waitForTimeout(1000);
  check('confirmation requested after price edit', await page.getByText('Expected monthly sales needed').isVisible());
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(800);
  check('save blocked without confirmation', (await saveState(page)).includes('failed'), await saveState(page));
  await page.locator('#confirm-units').fill('900');
  await page.getByRole('button', { name: 'Confirm expected sales' }).click();
  await page.waitForTimeout(1000);
  m = await metrics(page);
  check('confirmed units applied', m.includes('£5,400'), m);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitSaved(page);
  check('confirmed price change saved', (await saveState(page)).includes('Saved'));
  // Restore fixture values
  await page.locator('#input-unitPrice').fill('5.5'); await page.locator('#input-unitPrice').press('Enter');
  await page.waitForTimeout(800);
  await page.locator('#confirm-units').fill('950');
  await page.getByRole('button', { name: 'Confirm expected sales' }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitSaved(page);

  // 5. Supplier response from the shock
  await page.locator('.scenario-item', { hasText: 'Energy cost increase' }).click();
  await ready(page);
  await page.getByRole('button', { name: /\+ Response to/ }).click();
  await page.getByLabel('Switch supplier').check();
  await page.locator('#fork-ingredientCostPerUnit').fill('1.8');
  await page.locator('#fork-monthlyDelivery').fill('100');
  await page.getByRole('button', { name: 'Create response' }).click();
  await page.waitForSelector('.dialog', { state: 'detached' });
  await waitSaved(page);
  await ready(page);
  m = await metrics(page);
  check('supplier response fixture', m.includes('£5,000') && m.includes('£4,400') && m.includes('£600') && m.includes('−£100'), m);

  // 6. Frozen baseline
  await page.locator('.scenario-item', { hasText: 'Baseline' }).first().click();
  await ready(page);
  check('baseline read-only', (await saveState(page)).includes('Read-only') && await page.locator('#input-unitPrice').isDisabled());
  await typeInCell(page, 3, 1, '9');
  m = await metrics(page);
  check('frozen baseline sheet edit blocked', m.includes('£5,000'), m);

  // 7. Inspect from sheet
  const p15 = await cellPoint(page, 15, 1);
  await page.mouse.click(p15.x, p15.y);
  await page.waitForTimeout(500);
  const insp = await page.locator('.inspect').first().innerText();
  check('inspect from sheet cell', insp.includes('=B11-B14'), insp.slice(0, 80));

  // 8. Compare
  await page.getByRole('tab', { name: 'Compare' }).click();
  await page.waitForTimeout(500);
  const table = (await page.locator('table.compare').innerText()).replace(/\s+/g, ' ');
  check('compare table has all four', ['Baseline', 'Energy cost increase', 'Price change', 'Switch supplier'].every((n) => table.includes(n)), table);
  check('compare profit changes', table.includes('−£200') && table.includes('+£125') && table.includes('−£100'), table);
  await page.getByRole('button', { name: 'Inspect Profit for Price change' }).click();
  const insp2 = await page.locator('.inspect').first().innerText();
  check('inspect from comparison', insp2.includes('=B11-B14') && insp2.includes('825'), insp2.slice(0, 200));
  await shot(page, 'compare', { fullPage: true });

  // 9. Reload
  const url = page.url();
  await page.reload();
  await page.waitForSelector('table.compare');
  const table2 = (await page.locator('table.compare').innerText()).replace(/\s+/g, ' ');
  check('reload keeps compare view and data', table2.includes('+£125') && table2.includes('Switch supplier'));
  await page.getByRole('tab', { name: 'Model' }).click();
  await ready(page);

  // 10. Zero revenue + negative profit
  await page.locator('.scenario-item', { hasText: 'Switch supplier' }).click();
  await ready(page);
  await page.locator('#input-monthlyUnits').fill('0'); await page.locator('#input-monthlyUnits').press('Enter');
  await page.waitForTimeout(1200);
  m = await metrics(page);
  check('zero revenue margin N/A and loss', m.includes('N/A') && m.includes('Loss') && m.includes('−£2,600'), m);
  await shot(page, 'zero');

  // 11. Unsaved switch prompt
  await page.locator('.scenario-item', { hasText: 'Price change' }).click();
  check('unsaved switch prompts', await page.getByText('Save your changes first?').isVisible());
  await page.getByRole('button', { name: 'Cancel' }).click();

  // 12. Network failure
  await page.route('**/api/projects/*/scenarios/*', (route) => route.request().method() === 'PUT' ? route.abort() : route.continue());
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(1000);
  check('network failure shows failed', (await saveState(page)).includes('failed') && await page.getByText('Not saved — network problem.').isVisible());
  await page.unroute('**/api/projects/*/scenarios/*');

  // 13. Conflict: another tab saves first
  const page2 = await ctx.newPage();
  await page2.goto(url.replace(/view=compare/, ''));
  await page2.getByRole('tab', { name: 'Model' }).click().catch(() => {});
  await page2.locator('.scenario-item', { hasText: 'Energy cost increase' }).click();
  await ready(page2);
  await page2.locator('#scn-notes').fill('Changed in another tab');
  await page2.getByRole('button', { name: 'Save', exact: true }).click();
  await waitSaved(page2);
  await page2.close();
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.waitForTimeout(1200);
  check('conflict detected', (await saveState(page)).includes('conflict') && await page.getByText('This project was changed elsewhere.').isVisible());
  await shot(page, 'conflict');
  await page.getByRole('button', { name: 'Apply my edits to the latest version' }).click();
  await page.waitForTimeout(2500);
  check('edits reapplied, unsaved', (await saveState(page)).includes('Unsaved') && (await page.locator('#input-monthlyUnits').inputValue()) === '0');
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await page.waitForTimeout(1500);
  m = await metrics(page);
  check('discard restores saved', m.includes('£600'), m);

  // 14. Phone layout
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.goto(url.replace(/[?&]view=compare/, ''));
  await ready(phone);
  await shot(phone, 'phone', { fullPage: false });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no page-level horizontal scroll on phone', overflow <= 1, String(overflow));

  console.log('\nBrowser console errors (the network failure and the 409 conflict are expected):\n' + (logs.join('\n') || '(none)'));
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
