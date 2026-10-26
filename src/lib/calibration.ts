import { many, timeCompare } from './db';
import { finalAgentPicksCte } from './final-agent-picks';

/**
 * Per-agent calibration learned from settled history — no fine-tuning, no invented data.
 *
 * Only the agent's CURRENT model counts (a role keeps its model; answers from a fallback or an older model are
 * another model's record), and only picks saved before kickoff. The bias is the average gap between what the agent
 * estimated and how often it actually won, shrunk toward zero while the sample is small (Bayesian-style prior worth
 * PRIOR_WEIGHT picks), so a lucky or unlucky streak cannot swing it.
 */
export type Calibration = { agentId: string; model: string; n: number; won: number; hitRate: number; avgEstimated: number; bias: number };

const PRIOR_WEIGHT = 40;
const MIN_SAMPLE = 20;
const MAX_SHIFT = 0.12;
const TTL_MS = 30 * 60_000;

const g = globalThis as unknown as { __bmCalibration?: { at: number; data: Map<string, Calibration> } };

/** Pure: computes one agent's calibration from its decided picks (estimated probability + outcome). */
export function calibrationOf(agentId: string, model: string, rows: Array<{ estimated: number; won: boolean }>): Calibration | null {
  const valid = rows.filter((r) => Number.isFinite(r.estimated) && r.estimated > 0 && r.estimated <= 1);
  if (valid.length < MIN_SAMPLE) return null;
  const won = valid.filter((r) => r.won).length;
  const hitRate = won / valid.length;
  const avgEstimated = valid.reduce((s, r) => s + r.estimated, 0) / valid.length;
  const raw = avgEstimated - hitRate;
  const bias = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, raw * (valid.length / (valid.length + PRIOR_WEIGHT))));
  return { agentId, model, n: valid.length, won, hitRate, avgEstimated, bias: Math.round(bias * 1000) / 1000 };
}

/** The agent's own estimate corrected by its measured bias (an over-optimistic agent is pulled down). */
export function calibrated(p: number | null, c: Calibration | null | undefined): number | null {
  if (p === null || !c) return p;
  return Math.max(0.01, Math.min(0.99, Math.round((p - c.bias) * 1000) / 1000));
}

export const sameModel = (stored: string | null | undefined, assigned: string | null | undefined) =>
  !!stored && !!assigned && (stored === assigned || stored.startsWith(assigned) || assigned.startsWith(stored.split(':')[0]));

/** Loads (and caches for 30 minutes) every voting agent's calibration for its currently assigned model. */
export async function loadCalibrations(assigned: Map<string, string>, force = false): Promise<Map<string, Calibration>> {
  if (!force && g.__bmCalibration && Date.now() - g.__bmCalibration.at < TTL_MS) return g.__bmCalibration.data;
  const rows = await many<{ agent_id: string; model_id: string; estimated_probability: string | number | null; outcome: string }>(
    `${finalAgentPicksCte()}
     SELECT p.agent_id,p.model_id,p.estimated_probability,p.outcome FROM final_picks p JOIN fixtures f ON f.id=p.fixture_id
     WHERE p.decision='BET_CANDIDATE' AND p.outcome IN ('WON','LOST') AND p.estimated_probability IS NOT NULL
       AND ${timeCompare('p.created_at', '<', 'f.kickoff_utc')}`,
  ).catch(() => []);
  const data = new Map<string, Calibration>();
  for (const [agentId, model] of assigned) {
    const own = rows.filter((r) => r.agent_id === agentId && sameModel(r.model_id, model)).map((r) => ({ estimated: Number(r.estimated_probability), won: r.outcome === 'WON' }));
    const c = calibrationOf(agentId, model, own);
    if (c) data.set(agentId, c);
  }
  g.__bmCalibration = { at: Date.now(), data };
  return data;
}

/** Synchronous read for code that cannot await (consensus guards); empty until loaded. */
export const cachedCalibrations = () => g.__bmCalibration?.data ?? new Map<string, Calibration>();

/** Romanian line for the agent's prompt. */
export function calibrationText(c: Calibration | null | undefined) {
  if (!c || Math.abs(c.bias) < 0.01) return null;
  const pp = Math.round(Math.abs(c.bias) * 1000) / 10;
  return c.bias > 0
    ? `CALIBRARE AUTOMATĂ: pe ${c.n} pronosticuri decise, cu modelul tău, ai estimat în medie ${Math.round(c.avgEstimated * 100)}% și ai nimerit ${Math.round(c.hitRate * 100)}%. Echipa îți scade automat estimările cu ${pp} pp înainte de praguri; estimează realist ca să nu fii eliminat.`
    : `CALIBRARE AUTOMATĂ: pe ${c.n} pronosticuri decise ai fost prudent (estimat ${Math.round(c.avgEstimated * 100)}%, nimerit ${Math.round(c.hitRate * 100)}%); estimările tale primesc +${pp} pp înainte de praguri.`;
}
