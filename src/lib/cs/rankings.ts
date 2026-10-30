import { atomic, many, one } from '../db';
import { teamKey } from './teams';

/**
 * Team reputation: the official Valve Regional Standings (VRS), published by Valve on GitHub, roughly the first
 * Monday of every month (live/<year>/standings_global_YYYY_MM_DD.md). Rank, points and the five-player roster.
 */
const RAW = 'https://raw.githubusercontent.com/ValveSoftware/counter-strike_regional_standings/main/live';
export type CsRanking = { team: string; rank: number; points: number; roster: string[] };

/** Pure: the markdown standings table → rows. */
export function parseStandings(md: string): CsRanking[] {
  const out: CsRanking[] = [];
  for (const line of md.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 5 || !/^\d+$/.test(cells[1] ?? '') || !/^\d+$/.test(cells[2] ?? '')) continue;
    out.push({ rank: Number(cells[1]), points: Number(cells[2]), team: cells[3], roster: (cells[4] ?? '').split(',').map((x) => x.trim()).filter(Boolean) });
  }
  return out;
}

/** First Monday of a month, as YYYY_MM_DD (Valve's usual publication day). */
function firstMonday(y: number, m: number) {
  const d = new Date(Date.UTC(y, m, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Candidate publication dates, newest first: every day of the current month down to the first days of the previous one. */
export function candidateDates(now = new Date()): string[] {
  const out: string[] = [];
  const fmt = (d: Date) => `${d.getUTCFullYear()}_${String(d.getUTCMonth() + 1).padStart(2, '0')}_${String(d.getUTCDate()).padStart(2, '0')}`;
  for (const back of [0, 1, 2]) {
    const y = now.getUTCFullYear(), m = now.getUTCMonth() - back;
    const fm = firstMonday(y, m);
    // The usual day first, then the neighbouring days of that week (Valve sometimes publishes a day late).
    for (const shift of [0, 1, 2, -1, 3, 4, 7]) { const d = new Date(fm); d.setUTCDate(d.getUTCDate() + shift); if (d.getTime() <= now.getTime()) out.push(fmt(d)); }
  }
  return [...new Set(out)];
}

/** Downloads the newest standings (at most once a day) and replaces cs_rankings. */
export async function syncCsRankings(now = new Date()) {
  const current = await one<{ as_of: string }>('SELECT as_of FROM cs_rankings LIMIT 1').catch(() => null);
  for (const date of candidateDates(now)) {
    if (current?.as_of === date) return { asOf: date, unchanged: true };
    const res = await fetch(`${RAW}/${date.slice(0, 4)}/standings_global_${date}.md`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!res?.ok) continue;
    const rows = parseStandings(await res.text());
    if (rows.length < 20) continue;
    // Written in small batches (the D1 bridge limits one batch), then the previous month's rows are removed.
    const statements = rows.map((r) => ({
      text: `INSERT INTO cs_rankings(team_key,team,rank,points,roster,as_of) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(team_key) DO UPDATE SET team=EXCLUDED.team,rank=EXCLUDED.rank,points=EXCLUDED.points,roster=EXCLUDED.roster,as_of=EXCLUDED.as_of`,
      params: [teamKey(r.team), r.team, r.rank, r.points, r.roster.join(', '), date],
    }));
    for (let i = 0; i < statements.length; i += 40) await atomic(statements.slice(i, i + 40));
    await atomic([{ text: 'DELETE FROM cs_rankings WHERE as_of<>$1', params: [date] }]);
    return { asOf: date, teams: rows.length };
  }
  return { asOf: current?.as_of ?? null, error: 'Clasamentul Valve nu a putut fi descărcat' };
}

export async function loadRankings(): Promise<Map<string, CsRanking & { asOf: string }>> {
  const rows = await many<{ team_key: string; team: string; rank: number; points: number; roster: string | null; as_of: string }>('SELECT team_key,team,rank,points,roster,as_of FROM cs_rankings').catch(() => []);
  return new Map(rows.map((r) => [r.team_key, { team: r.team, rank: Number(r.rank), points: Number(r.points), roster: (r.roster ?? '').split(',').map((x) => x.trim()).filter(Boolean), asOf: r.as_of }]));
}

/** A team's standing by name (exact key, else the closest key that starts/ends with it). */
export function rankingFor(map: Map<string, CsRanking & { asOf: string }>, name: string, acronym?: string | null) {
  const k = teamKey(name);
  if (map.has(k)) return map.get(k)!;
  if (acronym && map.has(teamKey(acronym))) return map.get(teamKey(acronym))!;
  for (const [key, v] of map) if (k.length >= 4 && key.length >= 4 && (key.startsWith(k) || k.startsWith(key))) return v;
  return null;
}
