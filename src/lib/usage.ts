import { query, one, type Db } from './db';

/** UTC day key used for provider quotas. */
export const utcDay = (at = new Date()) => at.toISOString().slice(0, 10);

export async function recordProviderUsage(provider: string, opts: { requests?: number; tokens?: number; errors?: number } = {}) {
  try {
    await query(
      `INSERT INTO provider_usage(provider, day, requests, tokens, errors) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (provider, day) DO UPDATE SET requests = provider_usage.requests + EXCLUDED.requests,
         tokens = provider_usage.tokens + EXCLUDED.tokens, errors = provider_usage.errors + EXCLUDED.errors`,
      [provider, utcDay(), opts.requests ?? 1, opts.tokens ?? 0, opts.errors ?? 0],
    );
  } catch (error) {
    console.warn(JSON.stringify({ event: 'usage_record_failed', provider, message: (error as Error).message }));
  }
}

export async function providerUsageToday(provider: string) {
  const row = await one<{ requests: number; tokens: number; errors: number }>(
    'SELECT requests, tokens, errors FROM provider_usage WHERE provider=$1 AND day=$2',
    [provider, utcDay()],
  );
  return row ?? { requests: 0, tokens: 0, errors: 0 };
}

/** Totals across every AI provider for the current UTC day. */
export async function aiUsageToday(db?: Db) {
  const row = await one<{ requests: string; tokens: string }>(
    `SELECT COALESCE(SUM(requests),0) AS requests, COALESCE(SUM(tokens),0) AS tokens FROM provider_usage
     WHERE day=$1 AND provider IN ('groq','gemini','openrouter')`,
    [utcDay()], db,
  );
  return { requests: Number(row?.requests ?? 0), tokens: Number(row?.tokens ?? 0) };
}
