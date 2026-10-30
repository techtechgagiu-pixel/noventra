import { many, one, query } from '../db';
import { sportsGet } from '../sports/http';
import { persistFixtures } from '../sports/fixtures';
import type { Fixture, FixtureStatus } from '../sports/types';

/**
 * PandaScore (free "Fixtures" plan): Counter-Strike schedule, results and teams. All CS endpoints use the /csgo/
 * prefix. The token stays on the server (PANDASCORE_TOKEN), never in the browser or in logs.
 * Every CS match is saved in cs_matches (history, head-to-head) and, when it is within the betting window, as a
 * site fixture `ps:<id>` in the "Counter-Strike 2" league (score = maps won).
 */
const BASE = 'https://api.pandascore.co';
export const CS_LEAGUE = { id: 'CS2', key: 'csgo', name: 'Counter-Strike 2', country: 'Esports' };
const token = () => process.env.PANDASCORE_TOKEN?.trim() || '';
export const pandascoreConfigured = () => !!token();

export type CsMatch = {
  id: string; beginAt: string; status: string; bestOf: number | null;
  team1: { id: string | null; name: string; acronym: string | null; logo: string | null };
  team2: { id: string | null; name: string; acronym: string | null; logo: string | null };
  score1: number | null; score2: number | null; winnerId: string | null;
  league: string | null; serie: string | null; tournament: string | null; tier: string | null;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Pure: one PandaScore match → CsMatch (null for matches without two named teams or a date). */
export function parseCsMatch(raw: unknown): CsMatch | null {
  const m = obj(raw);
  const teams = arr(m.opponents).map((o) => obj(obj(o).opponent));
  const at = str(m.begin_at) || str(m.scheduled_at);
  if (teams.length !== 2 || !teams[0].name || !teams[1].name || !Number.isFinite(Date.parse(at)) || !str(m.id)) return null;
  const team = (t: Obj) => ({ id: str(t.id) || null, name: str(t.name).trim(), acronym: str(t.acronym) || null, logo: str(t.image_url) || null });
  const [t1, t2] = [team(teams[0]), team(teams[1])];
  const score = (id: string | null) => { const r = arr(m.results).map(obj).find((x) => str(x.team_id) === id); return r ? num(r.score) : null; };
  const t = obj(m.tournament);
  return {
    id: str(m.id), beginAt: new Date(at).toISOString(), status: str(m.status) || 'not_started',
    bestOf: str(m.match_type) === 'best_of' ? num(m.number_of_games) : num(m.number_of_games),
    team1: t1, team2: t2, score1: score(t1.id), score2: score(t2.id), winnerId: str(m.winner_id) || null,
    league: str(obj(m.league).name) || null, serie: str(obj(m.serie).full_name) || str(obj(m.serie).name) || null,
    tournament: str(t.name) || null, tier: str(t.tier) || str(obj(m.serie).tier) || null,
  };
}

const STATUS: Record<string, FixtureStatus> = { not_started: 'pre', running: 'in', finished: 'post', canceled: 'cancelled', postponed: 'postponed' };

/** Pure: CsMatch → a site fixture (no prices; those come from OddsPapi / the Stake export). */
export function csFixture(m: CsMatch, fetchedAt = new Date().toISOString()): Fixture {
  const status = STATUS[m.status] ?? 'pre';
  return {
    id: `ps:${m.id}`, provider: 'pandascore', providerId: m.id, leagueId: CS_LEAGUE.id, leagueKey: CS_LEAGUE.key, leagueName: CS_LEAGUE.name, country: CS_LEAGUE.country,
    home: m.team1.name, away: m.team2.name, homeTeamId: m.team1.id ?? undefined, awayTeamId: m.team2.id ?? undefined,
    homeLogo: m.team1.logo ?? undefined, awayLogo: m.team2.logo ?? undefined, kickoff: m.beginAt, status,
    homeScore: status === 'pre' ? null : m.score1, awayScore: status === 'pre' ? null : m.score2, odds: null, fetchedAt,
  };
}

async function page(path: string, params: Record<string, string>, ttlMs: number): Promise<unknown[]> {
  const url = new URL(BASE + path);
  url.search = new URLSearchParams({ ...params, token: token() }).toString();
  return arr(await sportsGet(url.toString(), { provider: 'pandascore', ttlMs }));
}

async function saveMatches(list: CsMatch[]) {
  for (const m of list) {
    await query(`INSERT INTO cs_matches(id,begin_at,status,best_of,team1_id,team1,team1_acronym,team2_id,team2,team2_acronym,score1,score2,winner_id,league,serie,tournament,tier,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT(id) DO UPDATE SET begin_at=EXCLUDED.begin_at,status=EXCLUDED.status,best_of=EXCLUDED.best_of,team1_id=EXCLUDED.team1_id,team1=EXCLUDED.team1,
        team1_acronym=EXCLUDED.team1_acronym,team2_id=EXCLUDED.team2_id,team2=EXCLUDED.team2,team2_acronym=EXCLUDED.team2_acronym,score1=EXCLUDED.score1,score2=EXCLUDED.score2,
        winner_id=EXCLUDED.winner_id,league=EXCLUDED.league,serie=EXCLUDED.serie,tournament=EXCLUDED.tournament,tier=EXCLUDED.tier,updated_at=EXCLUDED.updated_at`,
      [m.id, m.beginAt, m.status, m.bestOf, m.team1.id, m.team1.name, m.team1.acronym, m.team2.id, m.team2.name, m.team2.acronym, m.score1, m.score2, m.winnerId, m.league, m.serie, m.tournament, m.tier, new Date().toISOString()]);
  }
}

/**
 * Upcoming (next 8 days) and running matches, recent results (incremental; the first run backfills ~90 days for team
 * history), and a direct re-read of site fixtures that should have finished. Free plan: 1,000 requests/hour; one run
 * uses about 5–15 (the first one up to ~45).
 */
export async function syncCsMatches(now = new Date()) {
  if (!pandascoreConfigured()) return { skipped: 'PANDASCORE_TOKEN lipsește' };
  const parse = (xs: unknown[]) => xs.map(parseCsMatch).filter((x): x is CsMatch => !!x);
  // A page is the last one only when the source returned fewer rows than asked (not when we skipped some of them).
  const fetchPage = async (path: string, params: Record<string, string>, ttl: number) => { const raw = await page(path, params, ttl); return { full: raw.length >= 100, list: parse(raw) }; };
  const until = new Date(now.getTime() + 8 * 86400_000).toISOString();
  const upcoming: CsMatch[] = [];
  for (let p = 1; p <= 10; p++) {
    const batch = await fetchPage('/csgo/matches/upcoming', { 'range[begin_at]': `${now.toISOString()},${until}`, sort: 'begin_at', per_page: '100', page: String(p) }, 10 * 60_000);
    upcoming.push(...batch.list);
    if (!batch.full) break;
  }
  const running = parse(await page('/csgo/matches/running', { per_page: '100' }, 5 * 60_000));
  // Results: newest first, until we reach what is already stored (or 90 days on the first run).
  const span = await one<{ newest: string | Date | null; oldest: string | Date | null; n: number | string }>("SELECT MAX(begin_at) AS newest, MIN(begin_at) AS oldest, COUNT(*) AS n FROM cs_matches WHERE status='finished'");
  // Backfill (first runs) until the stored results reach 90 days back; then only what is new since the last run.
  // (30.10: the unfiltered "past" list was mostly cancelled matches, so a count check makes sure results are there.)
  const backfill = !span?.oldest || Number(span.n) < 500 || new Date(span.oldest).getTime() > now.getTime() - 85 * 86400_000;
  const stopAt = backfill ? now.getTime() - 90 * 86400_000 : new Date(span!.newest!).getTime() - 2 * 86400_000;
  const newest = backfill ? null : span;
  const past: CsMatch[] = [];
  for (let p = 1; p <= (newest ? 10 : 60); p++) {
    // Finished matches only: the past list also holds cancelled ones, which carry no result.
    const batch = await fetchPage('/csgo/matches/past', { 'filter[status]': 'finished', sort: '-begin_at', per_page: '100', page: String(p) }, 10 * 60_000);
    past.push(...batch.list);
    if (!batch.full || batch.list.some((m) => Date.parse(m.beginAt) < stopAt)) break;
  }
  // Site fixtures still open after their start: read them by id (results can be late in the paged lists).
  const open = await many<{ provider_id: string }>(`SELECT provider_id FROM fixtures WHERE provider='pandascore' AND status IN ('pre','in') AND kickoff_utc < $1 AND kickoff_utc > $2`,
    [now.toISOString(), new Date(now.getTime() - 3 * 86400_000).toISOString()]);
  const reread: CsMatch[] = [];
  for (let i = 0; i < open.length; i += 50) reread.push(...parse(await page('/csgo/matches', { 'filter[id]': open.slice(i, i + 50).map((x) => x.provider_id).join(','), per_page: '100' }, 5 * 60_000)));
  const all = new Map<string, CsMatch>();
  for (const m of [...past, ...upcoming, ...running, ...reread]) all.set(m.id, m);
  await saveMatches([...all.values()]);
  // Site fixtures: everything from 3 days ago to 8 days ahead (results settle the tickets).
  const from = now.getTime() - 3 * 86400_000;
  const fixtures = [...all.values()].filter((m) => Date.parse(m.beginAt) >= from).map((m) => csFixture(m, now.toISOString()));
  await persistFixtures(fixtures);
  return { upcoming: upcoming.length, running: running.length, past: past.length, reread: reread.length, fixtures: fixtures.length };
}
