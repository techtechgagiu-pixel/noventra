import { sameModel } from './calibration';
import { decidedPicks } from './decided-picks';

/**
 * Vote weight per agent, from its own settled picks with its CURRENT model (owner decision 28.10: "vot ponderat").
 * The hit rate is shrunk toward the team's (prior of 40 picks), so a short lucky or unlucky run barely moves it, and a
 * new model starts at exactly 1. Weight = shrunk rate / team rate, kept within 0.8–1.2 of a vote.
 */
export const PRIOR = 40;
export const MIN_W = 0.8, MAX_W = 1.2;

export function weightsFrom(rows: Array<{ agent_id: string; model_id: string; outcome: string }>, assigned: Map<string, string>) {
  const own = rows.filter((r) => sameModel(r.model_id, assigned.get(r.agent_id)));
  const team = own.length ? own.filter((r) => r.outcome === 'WON').length / own.length : 0;
  const out = new Map<string, number>();
  if (!team) return out;
  for (const [id] of assigned) {
    const mine = own.filter((r) => r.agent_id === id);
    const won = mine.filter((r) => r.outcome === 'WON').length;
    const shrunk = (won + PRIOR * team) / (mine.length + PRIOR);
    out.set(id, Math.round(Math.min(MAX_W, Math.max(MIN_W, shrunk / team)) * 100) / 100);
  }
  return out;
}

export async function loadVoteWeights(assigned: Map<string, string>) {
  return weightsFrom(await decidedPicks(), assigned);
}
