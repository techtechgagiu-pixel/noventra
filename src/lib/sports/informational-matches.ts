import type { MatchRow } from '../catalog';

/** Schedules only. Kept separate from Fixture and from analysis/ticket inputs. */
export type InformationalMatch = {
  id: string; leagueId: string; league: string; country: string; home: string; away: string;
  homeLogo: string | null; awayLogo: string | null; kickoff: string;
  status: 'pre' | 'unknown'; score: null;
};
const teamName = (name: string) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ø/g, 'o').replace(/ł/g, 'l')
  .replace(/[^a-z0-9]+/g, ' ').split(' ').filter((s) => s && !['fc', 'afc', 'cf', 'sc', 'if', 'fk', 'ac', 'club', 'football', 'futbol'].includes(s)).join(' ');

/** Preserve the original row, adding provenance when another provider lists the same match. */
export function mergeInformationalMatches(existing: MatchRow[], extra: InformationalMatch[]): MatchRow[] {
  const out = [...existing], ids = new Map(existing.map((m, i) => [m.id, i]));
  const pairs = new Map<string, Array<{ at: number; index: number }>>();
  const pair = (m: Pick<InformationalMatch, 'home' | 'away'>) => {
    const home = teamName(m.home), away = teamName(m.away);
    return home && away ? `${home}|${away}` : null;
  };
  const remember = (m: Pick<InformationalMatch, 'home' | 'away' | 'kickoff'>, index: number) => {
    const key = pair(m);
    if (key) pairs.set(key, [...(pairs.get(key) ?? []), { at: Date.parse(m.kickoff), index }]);
  };
  existing.forEach(remember);
  for (const m of extra) {
    const key = pair(m);
    const index = ids.get(m.id) ?? (key ? pairs.get(key)?.find((p) => Math.abs(p.at - Date.parse(m.kickoff)) <= 600_000)?.index : undefined);
    if (index !== undefined) {
      const old = out[index];
      out[index] = { ...old, sources: [...new Set([...(old.sources ?? (old.source ? [old.source] : [])), 'the-odds-api' as const])] };
    } else {
      const index = out.length;
      out.push({ ...m, source: 'the-odds-api', sources: ['the-odds-api'], odds: null, analysis: null });
      ids.set(m.id, index); remember(m, index);
    }
  }
  return out;
}
