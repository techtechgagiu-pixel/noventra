import { one, timeCompare, SQL_AGO } from '../db';
import { runAutomation } from '../automation';
import { pandascoreConfigured, syncCsMatches } from './pandascore';
import { oddspapiConfigured, syncCsOdds } from './oddspapi';
import { syncCsRankings } from './rankings';

/**
 * Counter-Strike data refresh, on the Render runner (which holds the API keys): every 30 minutes the schedule and
 * results, the prices of the next 72 hours (each match re-priced at most every 6 hours) and, twice a day, the Valve
 * standings. Cloudflare's 5-minute cron wakes the runner when a refresh is due (see scheduled.ts).
 */
export const CS_SYNC_MINUTES = 30;
const g = globalThis as unknown as { __bmCsRankingsAt?: number };

/** Due when it never ran or the last run finished over 30 minutes ago (6 hours while the keys are missing). */
export async function csSyncDue(): Promise<boolean> {
  const r = await one<{ finished_at: string | Date | null; detail: unknown }>("SELECT finished_at,detail FROM automation_runs WHERE name='cs-sync'").catch(() => null);
  if (!r?.finished_at) return true;
  const detail = (typeof r.detail === 'string' ? JSON.parse(r.detail) : r.detail) as { configured?: boolean } | null;
  const every = detail?.configured === false ? 6 * 60 : CS_SYNC_MINUTES;
  return Date.now() - new Date(r.finished_at).getTime() >= every * 60_000;
}

export async function syncCs() {
  return runAutomation('cs-sync', async () => {
    const configured = pandascoreConfigured();
    const detail: Record<string, unknown> = { configured, pandascore: configured, oddspapi: oddspapiConfigured() };
    if (!configured) return { ...detail, note: 'PANDASCORE_TOKEN lipsește pe runner' };
    detail.matches = await syncCsMatches();
    if (!g.__bmCsRankingsAt || Date.now() - g.__bmCsRankingsAt > 12 * 3600_000) {
      detail.rankings = await syncCsRankings().catch((e) => ({ error: (e as Error).message.slice(0, 120) }));
      g.__bmCsRankingsAt = Date.now();
    }
    detail.odds = await syncCsOdds().catch((e) => ({ error: (e as Error).message.slice(0, 120) }));
    return detail;
  });
}

/** Called on every runner wake-up: refreshes only when due, never twice at once (database lease). */
export async function maybeSyncCs() {
  if (!(await csSyncDue())) return { status: 'not-due' as const };
  return syncCs();
}

/** Cloudflare side: whether the runner should be woken for a CS refresh (no keys needed here). */
export async function csWakeDue(): Promise<boolean> {
  const r = await one<{ n: number }>(`SELECT count(*) AS n FROM automation_runs WHERE name='cs-sync' AND finished_at IS NOT NULL AND ${timeCompare('finished_at', '>', SQL_AGO(CS_SYNC_MINUTES, 'minutes'))}`).catch(() => null);
  return !r || Number(r.n) === 0;
}
