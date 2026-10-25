/** Cosmetic career record only. Pending/void/NO_BET and model usage never award points. */
export const AGENT_RANKS = [
  { id: 'normal', name: 'Normal', minimum: 0, rate: 0, strict: false },
  { id: 'refined', name: 'Rafinat', minimum: 5, rate: 0.5, strict: false },
  { id: 'unique', name: 'Unic', minimum: 10, rate: 0.6, strict: false },
  { id: 'elite', name: 'Elite', minimum: 15, rate: 0.7, strict: false },
  { id: 'super', name: 'Super', minimum: 15, rate: 0.8, strict: false },
  { id: 'diamond', name: 'Diamond Super', minimum: 15, rate: 0.8, strict: true },
] as const;

export function agentProgression(record: { won: number; lost: number }, editorial = false) {
  if (editorial) return null;
  const won = Math.max(0, Math.trunc(record.won)), lost = Math.max(0, Math.trunc(record.lost));
  const decided = won + lost, rate = decided ? won / decided : 0;
  const xp = Math.max(0, won * 30 - lost * 15), level = 1 + Math.floor(xp / 100);
  let index = 0;
  for (let i = 1; i < AGENT_RANKS.length; i++) {
    const r = AGENT_RANKS[i];
    if (decided >= r.minimum && (r.strict ? rate > r.rate : rate >= r.rate)) index = i;
  }
  return { won, lost, decided, rate, xp, level, progress: xp % 100, toNextLevel: 100 - xp % 100, rank: AGENT_RANKS[index], nextRank: AGENT_RANKS[index + 1] ?? null };
}
