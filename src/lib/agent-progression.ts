/** Cosmetic career record only. Pending/void/NO_BET and model usage never award points. */
export const AGENT_RANKS = [
  { id: 'normal', name: 'Normal', minimum: 0, rate: 0 },
  { id: 'refined', name: 'Rafinat', minimum: 5, rate: 0.5 },
  { id: 'unique', name: 'Unic', minimum: 15, rate: 0.6 },
  { id: 'elite', name: 'Elite', minimum: 30, rate: 0.7 },
  { id: 'super', name: 'Super', minimum: 75, rate: 0.8 },
] as const;

export function agentProgression(record: { won: number; lost: number }, editorial = false) {
  if (editorial) return null;
  const won = Math.max(0, Math.trunc(record.won)), lost = Math.max(0, Math.trunc(record.lost));
  const decided = won + lost, rate = decided ? won / decided : 0;
  const xp = Math.max(0, won * 30 - lost * 15), level = 1 + Math.floor(xp / 100);
  let index = 0;
  for (let i = 1; i < AGENT_RANKS.length; i++) if (decided >= AGENT_RANKS[i].minimum && rate >= AGENT_RANKS[i].rate) index = i;
  return { won, lost, decided, rate, xp, level, progress: xp % 100, toNextLevel: 100 - xp % 100, rank: AGENT_RANKS[index], nextRank: AGENT_RANKS[index + 1] ?? null };
}
