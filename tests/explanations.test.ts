import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BAKERY_INPUTS } from '@/lib/templates/bakery';
import { openDatabase } from '@/server/db';
import { ApiError } from '@/server/errors';
import { ExplanationService, lingConfigFromEnv } from '@/server/explanations';
import { ProjectService } from '@/server/projects';

const CONFIG = { apiKey: 'test-key', baseUrl: 'https://ling.example/v1', model: 'Ling-3.2-flash' };

async function shockProject() {
  const db = await openDatabase(':memory:');
  const projects = new ProjectService(db);
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
    const result = await new ExplanationService(db, CONFIG, impl).explain(p.id, shock.id, { expectedRevision: p.revision });

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
    await expectApiError(new ExplanationService(db, CONFIG, impl).explain(p.id, shock.id, { expectedRevision: p.revision - 1 }), 409, 'REVISION_CONFLICT');
    assert.equal(calls.length, 0);
  });

  it('reports a missing API key without calling Ling', async () => {
    const { db, p, shock } = await shockProject();
    await expectApiError(new ExplanationService(db, null).explain(p.id, shock.id, { expectedRevision: p.revision }), 503, 'EXPLANATION_UNAVAILABLE');
    assert.equal(lingConfigFromEnv({ ANTLING_API_KEY: '  ' } as unknown as NodeJS.ProcessEnv), null);
  });

  it('maps provider failures to safe errors', async () => {
    const { db, p, shock } = await shockProject();
    const run = (reply: Parameters<typeof fakeFetch>[0]) =>
      new ExplanationService(db, CONFIG, fakeFetch(reply).impl).explain(p.id, shock.id, { expectedRevision: p.revision });
    await expectApiError(run({ status: 401 }), 503, 'EXPLANATION_UNAVAILABLE');
    await expectApiError(run({ status: 429 }), 503, 'EXPLANATION_UNAVAILABLE');
    await expectApiError(run({ status: 500 }), 502, 'EXPLANATION_FAILED');
    await expectApiError(run({ body: { choices: [{ message: { content: '' } }] } }), 502, 'EXPLANATION_FAILED');
    await expectApiError(run({ error: Object.assign(new Error('t'), { name: 'TimeoutError' }) }), 504, 'EXPLANATION_FAILED');
    // A reply cut off by the length limit is never shown as if it were complete.
    await expectApiError(run({ body: { choices: [{ message: { content: 'Profit is £825. Revenue is £5,22' }, finish_reason: 'length' }] } }), 502, 'EXPLANATION_FAILED');
  });
});
