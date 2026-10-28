import { many, timeCompare } from './db';
import { finalAgentPicksCte } from './final-agent-picks';

/**
 * Every agent's decided picks (final position per match, saved before kickoff), newest match first.
 * Calibration, coaching and the per-agent track record all read this; it used to run the heavy window query once per
 * agent per analysed batch (≈2,000 runs a day). Now one query per process every 10 minutes.
 */
export type DecidedPick = { agent_id: string; model_id: string; market_key: string | null; odds: string | number | null; estimated_probability: string | number | null; outcome: 'WON' | 'LOST' };
const TTL_MS = 10 * 60_000;
const g = globalThis as unknown as { __bmDecided?: { at: number; rows: DecidedPick[]; pending?: Promise<DecidedPick[]> } };

export async function decidedPicks(force = false): Promise<DecidedPick[]> {
  const c = g.__bmDecided;
  if (!force && c && Date.now() - c.at < TTL_MS) return c.rows;
  if (c?.pending) return c.pending;
  const pending = many<DecidedPick>(
    `${finalAgentPicksCte()}
     SELECT p.agent_id,p.model_id,p.market_key,p.odds,p.estimated_probability,p.outcome FROM final_picks p JOIN fixtures f ON f.id=p.fixture_id
     WHERE p.decision='BET_CANDIDATE' AND p.outcome IN ('WON','LOST') AND ${timeCompare('p.created_at', '<', 'f.kickoff_utc')}
     ORDER BY f.kickoff_utc DESC,p.id DESC`,
  ).then((rows) => { g.__bmDecided = { at: Date.now(), rows }; return rows; })
    .catch((e) => { if (g.__bmDecided) g.__bmDecided.pending = undefined; throw e; });
  g.__bmDecided = { at: c?.at ?? 0, rows: c?.rows ?? [], pending };
  return pending;
}

/** Tests: forget the cached rows. */
export function clearDecidedPicks() { g.__bmDecided = undefined; }
