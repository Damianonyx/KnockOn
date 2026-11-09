import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BAKERY_INPUTS } from '@/lib/templates/bakery';
import { openDatabase } from '@/server/db';
import { ApiError } from '@/server/errors';
import { ExplanationService, lingConfigFromEnv } from '@/server/explanations';
import { ProjectService } from '@/server/projects';

const CONFIG = { apiKey: 'test-key', baseUrl: 'https://ling.example/v1', model: 'Ling-3.2-flash' };
const VISITOR = { ownerHash: 'owner-a', ipHash: 'ip-1' };

async function shockProject() {
  const db = await openDatabase(':memory:');
  const projects = new ProjectService(db, VISITOR.ownerHash);
  let p = await projects.createProject({ name: 'Corner Bakery', currency: 'GBP', templateId: 'bakery-v1', initialData: 'demo' });
  p = await projects.forkScenario(p.id, { expectedRevision: 1, sourceScenarioId: p.baselineScenarioId, kind: 'shock', name: 'Energy shock' });
  const shock = p.scenarios.find((s) => s.kind === 'shock')!;
  const workbook = structuredClone(shock.workbook) as any;
  const energy = BAKERY_INPUTS.find((i) => i.key === 'monthlyEnergy')!;
  workbook.sheets.model.cellData[energy.row][energy.col] = { v: 600, t: 2 };
  p = await projects.updateScenario(p.id, shock.id, { expectedRevision: p.revision, name: shock.name, notes: '', workbook, assumptions: shock.assumptions });
  return { db, p, shock };
}

function fakeFetch(reply: { status?: number; body?: unknown; error?: Error }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (reply.error) throw reply.error;
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof ApiError && error.status === status && error.code === code);
}

describe('Ling explanations', () => {
  it('sends grounded, server-calculated facts and returns an explanation tagged with the revision', async () => {
    const { db, p, shock } = await shockProject();
    const { impl, calls } = fakeFetch({ body: { choices: [{ message: { content: '<think>scratch</think>Profit fell by 200 GBP because energy (B5) rose.' } }] } });
    const result = await new ExplanationService(db, CONFIG, { visitor: VISITOR, fetchImpl: impl }).explain(p.id, shock.id, { expectedRevision: p.revision });

    assert.equal(result.explanation, 'Profit fell by 200 GBP because energy (B5) rose.');
    assert.equal(result.projectRevision, p.revision);
    assert.equal(result.model, 'Ling-3.2-flash');
    assert.deepEqual(result.changedInputs, [{ inputKey: 'monthlyEnergy', label: 'Monthly energy expense', cell: 'B5', from: 400, to: 600 }]);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://ling.example/v1/chat/completions');
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer test-key');
    const sent = JSON.parse(String(calls[0].init.body));
    assert.equal(sent.model, 'Ling-3.2-flash');
    const facts = sent.messages[1].content as string;
    assert.match(facts, /B5 Monthly energy expense: 400 → 600/);
    assert.match(facts, /B15 Profit = B11-B14 → 500 GBP/);
    assert.match(facts, /Profit change against baseline: -200 GBP/);
    assert.match(facts, /fictional demo figure/);
  });

  it('refuses to explain an outdated revision', async () => {
    const { db, p, shock } = await shockProject();
    const { impl, calls } = fakeFetch({ body: {} });
    await expectApiError(new ExplanationService(db, CONFIG, { visitor: VISITOR, fetchImpl: impl }).explain(p.id, shock.id, { expectedRevision: p.revision - 1 }), 409, 'REVISION_CONFLICT');
    assert.equal(calls.length, 0);
  });

  it('reports a missing API key without calling Ling', async () => {
    const { db, p, shock } = await shockProject();
    await expectApiError(new ExplanationService(db, null, { visitor: VISITOR }).explain(p.id, shock.id, { expectedRevision: p.revision }), 503, 'EXPLANATION_UNAVAILABLE');
    assert.equal(lingConfigFromEnv({ ANTLING_API_KEY: '  ' } as unknown as NodeJS.ProcessEnv), null);
  });

  it('maps provider failures to safe errors', async () => {
    const { db, p, shock } = await shockProject();
    const run = (reply: Parameters<typeof fakeFetch>[0]) =>
      new ExplanationService(db, CONFIG, { visitor: VISITOR, fetchImpl: fakeFetch(reply).impl, limits: { perVisitorPerHour: 99, perNetworkPerHour: 99, sitePerDay: 99 } }).explain(p.id, shock.id, { expectedRevision: p.revision });
    await expectApiError(run({ status: 401 }), 503, 'EXPLANATION_UNAVAILABLE');
    await expectApiError(run({ status: 429 }), 503, 'EXPLANATION_UNAVAILABLE');
    await expectApiError(run({ status: 500 }), 502, 'EXPLANATION_FAILED');
    await expectApiError(run({ body: { choices: [{ message: { content: '' } }] } }), 502, 'EXPLANATION_FAILED');
    await expectApiError(run({ error: Object.assign(new Error('t'), { name: 'TimeoutError' }) }), 504, 'EXPLANATION_FAILED');
    // A reply cut off by the length limit is never shown as if it were complete.
    await expectApiError(run({ body: { choices: [{ message: { content: 'Profit is £825. Revenue is £5,22' }, finish_reason: 'length' }] } }), 502, 'EXPLANATION_FAILED');
  });
  it('applies the per-visitor, per-network and site-wide limits before calling Ling', async () => {
    const { db, p, shock } = await shockProject();
    const reply = { body: { choices: [{ message: { content: 'Profit fell by 200.' }, finish_reason: 'stop' }] } };
    const limits = { perVisitorPerHour: 2, perNetworkPerHour: 3, sitePerDay: 4 };
    const { impl, calls } = fakeFetch(reply);
    const svc = (visitor: { ownerHash: string; ipHash: string }) => new ExplanationService(db, CONFIG, { visitor, fetchImpl: impl, limits });
    const ask = (visitor: { ownerHash: string; ipHash: string }) => svc(visitor).explain(p.id, shock.id, { expectedRevision: p.revision });
    await ask(VISITOR);
    await ask(VISITOR);
    await expectApiError(ask(VISITOR), 429, 'RATE_LIMITED'); // visitor limit
    assert.equal(calls.length, 2);
    // Another visitor cannot use this project at all.
    await expectApiError(ask({ ownerHash: 'owner-b', ipHash: 'ip-1' }), 404, 'NOT_FOUND');
    // The refused call was not counted: 2 used today, so two more fit under the site limit of 4, then it stops.
    const later = new Date(Date.now() + 3_600_000);
    const { takeExplanationQuota } = await import('@/server/rateLimit');
    await takeExplanationQuota(db, { ownerHash: 'owner-c', ipHash: 'ip-2' }, limits, later);
    await takeExplanationQuota(db, { ownerHash: 'owner-d', ipHash: 'ip-3' }, limits, later);
    await expectApiError(takeExplanationQuota(db, { ownerHash: 'owner-e', ipHash: 'ip-4' }, limits, later), 429, 'RATE_LIMITED'); // site-wide: 2 + 2 = 4 used today
  });

  it('caps one network across several browser IDs', async () => {
    const db = await openDatabase(':memory:');
    const { takeExplanationQuota } = await import('@/server/rateLimit');
    const limits = { perVisitorPerHour: 5, perNetworkPerHour: 2, sitePerDay: 50 };
    await takeExplanationQuota(db, { ownerHash: 'x1', ipHash: 'same-ip' }, limits);
    await takeExplanationQuota(db, { ownerHash: 'x2', ipHash: 'same-ip' }, limits);
    await expectApiError(takeExplanationQuota(db, { ownerHash: 'x3', ipHash: 'same-ip' }, limits), 429, 'RATE_LIMITED');
  });

  it('never explains another visitor’s project', async () => {
    const { db, p, shock } = await shockProject();
    const { impl, calls } = fakeFetch({ body: {} });
    await expectApiError(
      new ExplanationService(db, CONFIG, { visitor: { ownerHash: 'someone-else', ipHash: 'ip-9' }, fetchImpl: impl }).explain(p.id, shock.id, { expectedRevision: p.revision }),
      404,
      'NOT_FOUND',
    );
    assert.equal(calls.length, 0);
  });
});
