/**
 * Ling 3.2 Flash explanations, grounded in one saved scenario revision.
 *
 * Flow (SETUP.md, "Use Ling inside KnockOn"): the user saves, Univer
 * recalculates on the server, then this service sends the saved inputs,
 * assumptions, formulas, and calculated results to Ling and returns its
 * explanation tagged with the project revision it describes. A later save makes
 * that explanation stale. The API key stays on the server; browsers call the
 * KnockOn route, never AntLing directly. The spreadsheet keeps working when
 * Ling is unavailable.
 */
import type { Explanation, ExplanationRequest } from '@/lib/contracts/project';
import { BAKERY_INPUTS, BAKERY_RESULTS, BAKERY_SIMPLIFICATIONS } from '@/lib/templates/bakery';
import { getDatabase, type Sql } from './db';
import { ApiError, notFound, revisionConflict } from './errors';
import * as repo from './repository';

const DEFAULT_BASE_URL = 'https://api.ant-ling.com/v1';
const DEFAULT_MODEL = 'Ling-3.2-flash';
const REQUEST_TIMEOUT_MS = 60_000;

export interface LingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function lingConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LingConfig | null {
  const apiKey = env.ANTLING_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env.ANTLING_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ''),
    model: env.ANTLING_MODEL?.trim() || DEFAULT_MODEL,
  };
}

type ChangedInput = Explanation['changedInputs'][number];

const SYSTEM_PROMPT = `You explain results in KnockOn, an economics lab where people model a small business in a spreadsheet and compare scenarios.

Rules:
- Use only the figures, formulas, and assumptions in the data provided. Never invent numbers, customer behaviour, or demand responses.
- Every figure was calculated by the spreadsheet. Do not recalculate differently or round in a way that changes meaning.
- Name the cells and inputs behind each point, for example "Profit (B15 = B11 - B14)".
- Say what changed from the parent scenario and from the baseline, and trace how it flows through the formulas to profit.
- State the assumptions the result depends on. Say clearly when a figure is fictional demo data or an unconfirmed assumption.
- If the question asks about something the model does not include (such as tax, waste, or seasonality), say it is not modelled.
- Do not give financial, legal, or tax advice, and do not recommend a decision. Explain consequences only.
- Write in plain English for a small business owner or an economics student. Keep it under 220 words. Use short paragraphs or a short list. No headings.`;

function money(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return 'N/A';
  return `${Number(value.toFixed(6))} ${currency}`;
}

function changedInputs(from: repo.ScenarioRecord | null, to: repo.ScenarioRecord): ChangedInput[] {
  if (!from) return [];
  return BAKERY_INPUTS.flatMap((m) => {
    const before = from.calculation.inputs[m.key] ?? null;
    const after = to.calculation.inputs[m.key] ?? null;
    return before === after ? [] : [{ inputKey: m.key, label: m.label, cell: m.cell, from: before, to: after }];
  });
}

/** The grounded facts sent to Ling, built only from saved, server-calculated data. */
export function buildExplanationContext(
  project: repo.ProjectRecord,
  scenario: repo.ScenarioRecord,
  parent: repo.ScenarioRecord | null,
  baseline: repo.ScenarioRecord | null,
): string {
  const c = project.currency;
  const lines: string[] = [];
  lines.push(`Project: "${project.name}" (currency ${c})${project.demo ? '. Created from fictional demo figures, not real business data.' : '.'}`);
  lines.push(`Scenario: "${scenario.name}" (${scenario.kind})${parent ? `, forked from "${parent.name}" (${parent.kind})` : ''}.`);
  if (scenario.notes.trim()) lines.push(`User's notes: ${scenario.notes.trim()}`);

  lines.push('', 'Inputs (column B):');
  for (const m of BAKERY_INPUTS) {
    const value = scenario.calculation.inputs[m.key];
    const unitless = m.key === 'monthlyUnits';
    lines.push(`- ${m.cell} ${m.label}: ${unitless ? value : money(value, c)}`);
  }

  lines.push('', 'Formulas and calculated results:');
  for (const r of BAKERY_RESULTS) {
    const value = scenario.calculation.metrics[r.key];
    const shown = r.key === 'marginFraction' ? (value === null ? 'N/A (revenue is zero)' : `${Number((value * 100).toFixed(4))}%`) : money(value, c);
    lines.push(`- ${r.cell} ${r.label} = ${r.formula.slice(1)} → ${shown}`);
  }

  const changes = changedInputs(parent, scenario);
  if (parent) {
    lines.push('', `Inputs changed from "${parent.name}":`);
    if (changes.length === 0) lines.push('- None.');
    for (const ch of changes) lines.push(`- ${ch.cell} ${ch.label}: ${ch.from} → ${ch.to}`);
    lines.push(`Profit in "${parent.name}": ${money(parent.calculation.metrics.profit, c)}.`);
  }
  if (baseline && baseline.id !== scenario.id) {
    const base = baseline.calculation.metrics.profit;
    const now = scenario.calculation.metrics.profit;
    const delta = base !== null && base !== undefined && now !== null && now !== undefined ? now - base : null;
    lines.push(`Baseline profit: ${money(base, c)}. Profit change against baseline: ${money(delta, c)}.`);
  }

  lines.push('', 'Assumptions recorded for this scenario:');
  if (scenario.assumptions.length === 0) lines.push('- None recorded.');
  for (const a of scenario.assumptions) {
    const label = BAKERY_INPUTS.find((m) => m.key === a.inputKey)?.label ?? a.inputKey;
    const status = a.source === 'demo' ? 'fictional demo figure' : a.confirmed ? 'confirmed by the user' : 'user assumption, not confirmed';
    lines.push(`- ${label}: ${status}${a.note ? `. Note: ${a.note}` : ''}`);
  }

  lines.push('', 'Model simplifications:');
  for (const s of BAKERY_SIMPLIFICATIONS) lines.push(`- ${s}`);
  return lines.join('\n');
}

function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export class ExplanationService {
  constructor(
    private readonly db: Sql,
    private readonly config: LingConfig | null,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async explain(projectId: string, scenarioId: string, request: ExplanationRequest): Promise<Explanation> {
    const project = await repo.findProject(this.db, projectId);
    if (!project) throw notFound('Project');
    const scenario = await repo.findScenario(this.db, projectId, scenarioId);
    if (!scenario) throw notFound('Scenario');
    if (project.revision !== request.expectedRevision) throw revisionConflict(project.revision);
    if (!this.config) {
      throw new ApiError(503, 'EXPLANATION_UNAVAILABLE', 'Explanations are not set up yet. Add ANTLING_API_KEY to the server environment.');
    }

    const parent = scenario.parentScenarioId ? await repo.findScenario(this.db, projectId, scenario.parentScenarioId) : null;
    const baseline = await repo.findScenario(this.db, projectId, project.baselineScenarioId);
    const context = buildExplanationContext(project, scenario, parent, baseline);
    const question = request.question?.trim() || 'Explain these results and what drives them.';

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `${context}\n\nQuestion: ${question}` },
          ],
          // Ling may think before it answers; leave room so the answer is never cut short.
          max_tokens: 8192,
          temperature: 0.3,
        }),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      console.error(`[knockon] Ling request failed: ${timedOut ? 'timeout' : error instanceof Error ? error.name : 'unknown'}`);
      throw new ApiError(
        timedOut ? 504 : 502,
        'EXPLANATION_FAILED',
        timedOut ? 'Ling took too long to respond. Try again.' : 'Could not reach Ling. Your scenario is saved; try again shortly.',
      );
    }

    if (!response.ok) {
      console.error(`[knockon] Ling returned HTTP ${response.status}`);
      if (response.status === 401 || response.status === 403) {
        throw new ApiError(503, 'EXPLANATION_UNAVAILABLE', 'AntLing rejected the API key. Check ANTLING_API_KEY and model access.');
      }
      if (response.status === 429) {
        throw new ApiError(503, 'EXPLANATION_UNAVAILABLE', 'Ling is busy or the usage limit was reached. Try again later.');
      }
      throw new ApiError(502, 'EXPLANATION_FAILED', 'Ling could not produce an explanation. Try again.');
    }

    const body = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: unknown }; finish_reason?: string }[];
      usage?: { completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
    } | null;
    const choice = body?.choices?.[0];
    const content = choice?.message?.content;
    const explanation = typeof content === 'string' ? stripReasoning(content) : '';
    // Token counts only (never content): helps tune the length budget.
    console.info(
      `[knockon] Ling finish=${choice?.finish_reason ?? '?'} completion_tokens=${body?.usage?.completion_tokens ?? '?'} reasoning_tokens=${body?.usage?.completion_tokens_details?.reasoning_tokens ?? '?'}`,
    );
    if (choice?.finish_reason === 'length') {
      // Never show a cut-off answer as if it were complete.
      throw new ApiError(502, 'EXPLANATION_FAILED', 'Ling’s answer was cut short. Try again.');
    }
    if (!explanation) {
      throw new ApiError(502, 'EXPLANATION_FAILED', 'Ling returned an empty explanation. Try again.');
    }

    return {
      projectId,
      scenarioId,
      projectRevision: project.revision,
      model: this.config.model,
      explanation,
      generatedAt: new Date().toISOString(),
      changedInputs: changedInputs(parent, scenario),
    };
  }
}

export async function explanationService(): Promise<ExplanationService> {
  return new ExplanationService(await getDatabase(), lingConfigFromEnv());
}
