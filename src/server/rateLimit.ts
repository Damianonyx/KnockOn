/**
 * Explanation limits, so no one can run up the AntLing bill.
 *
 * Counters live in the database (fixed hourly and daily windows), so they hold
 * across every server instance. All three limits are checked in one
 * transaction; a refused request is not counted.
 */
import type { Sql } from './db';
import { ApiError } from './errors';
import type { Visitor } from './visitor';

export interface ExplainLimits {
  perVisitorPerHour: number;
  perNetworkPerHour: number;
  sitePerDay: number;
}

export const DEFAULT_EXPLAIN_LIMITS: ExplainLimits = { perVisitorPerHour: 10, perNetworkPerHour: 30, sitePerDay: 300 };

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function explainLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): ExplainLimits {
  return {
    perVisitorPerHour: positiveInt(env.EXPLAIN_LIMIT_PER_VISITOR_PER_HOUR, DEFAULT_EXPLAIN_LIMITS.perVisitorPerHour),
    perNetworkPerHour: positiveInt(env.EXPLAIN_LIMIT_PER_NETWORK_PER_HOUR, DEFAULT_EXPLAIN_LIMITS.perNetworkPerHour),
    sitePerDay: positiveInt(env.EXPLAIN_LIMIT_SITE_PER_DAY, DEFAULT_EXPLAIN_LIMITS.sitePerDay),
  };
}

async function bump(tx: Sql, bucket: string, window: string): Promise<number> {
  const { rows } = await tx.query<{ count: number }>(
    `INSERT INTO explanation_usage (bucket, window_start, count) VALUES ($1, $2, 1)
     ON CONFLICT (bucket, window_start) DO UPDATE SET count = explanation_usage.count + 1
     RETURNING count`,
    [bucket, window],
  );
  return Number(rows[0].count);
}

/** Count one explanation for this visitor, or throw 429 RATE_LIMITED when a limit is reached. */
export async function takeExplanationQuota(db: Sql, visitor: Visitor, limits: ExplainLimits, now = new Date()): Promise<void> {
  const hour = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const minutesLeft = 60 - now.getUTCMinutes();
  await db.transaction(async (tx) => {
    if ((await bump(tx, 'site', day)) > limits.sitePerDay) {
      throw new ApiError(429, 'RATE_LIMITED', 'KnockOn has reached today’s limit for explanations. Try again tomorrow.');
    }
    if ((await bump(tx, `visitor:${visitor.ownerHash}`, hour)) > limits.perVisitorPerHour) {
      throw new ApiError(429, 'RATE_LIMITED', `You’ve used your ${limits.perVisitorPerHour} explanations for this hour. Try again in ${minutesLeft} minutes.`);
    }
    if ((await bump(tx, `network:${visitor.ipHash}`, hour)) > limits.perNetworkPerHour) {
      throw new ApiError(429, 'RATE_LIMITED', `Too many explanations from this network this hour. Try again in ${minutesLeft} minutes.`);
    }
  });
  // Old counters are useless after a day; tidy up now and then.
  if (Math.random() < 0.02) {
    const cutoff = new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);
    await db.query('DELETE FROM explanation_usage WHERE window_start < $1', [cutoff]).catch(() => undefined);
  }
}
