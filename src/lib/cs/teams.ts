/**
 * Counter-Strike team names differ between sources ("Team Spirit" / "Spirit", "BetBoom Team" / "BETBOOM",
 * "FUT Esports" / "FUT"). A team key keeps only the distinctive part, so the same club matches across PandaScore,
 * the Valve standings, OddsPapi and the Stake export.
 */
const NOISE = new Set(['team', 'esports', 'esport', 'gaming', 'club', 'gg', 'clan', 'academy_', 'org', 'the']);

export function teamKey(name: string): string {
  const words = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const kept = words.filter((w) => !NOISE.has(w));
  return (kept.length ? kept : words).join('');
}

/** Same team when the keys are equal, or one is the other's start/end with at least 4 characters ("ninjasinpyjamas"/"nip" is not caught on purpose). */
export function sameTeam(a: string, b: string): boolean {
  const x = teamKey(a), y = teamKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 4 && (l.startsWith(s) || l.endsWith(s));
}

/** Same CS match: both teams the same and the start within 30 minutes (esports schedules slip more than football). */
export function sameCsMatch(f: { home: string; away: string; kickoff: string }, e: { home: string; away: string; kickoff: string }, windowMin = 30): 'same' | 'swapped' | null {
  if (Math.abs(Date.parse(f.kickoff) - Date.parse(e.kickoff)) > windowMin * 60_000) return null;
  if (sameTeam(f.home, e.home) && sameTeam(f.away, e.away)) return 'same';
  if (sameTeam(f.home, e.away) && sameTeam(f.away, e.home)) return 'swapped';
  return null;
}
