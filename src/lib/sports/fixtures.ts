import { createHash } from 'node:crypto';
import { many, query, SQL_NOW, isD1, atomic } from '../db';
import { dateRange, localDate, yyyymmdd } from '../time';
import { espnLeagueDay, espnMatchDays } from './espn';
import { lpfFixtures } from './lpf';
import type { Fixture, League, MarketQuote } from './types';
import { withTheOddsPrices } from './the-odds-prices';
import { withImportedPrices } from './imported-prices';

export type FixtureProvider = (leagues: League[], days: string[]) => Promise<{ fixtures: Fixture[]; errors: string[] }>;

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 32);

export async function getLeagues(opts: { top10Only?: boolean; includeDisabled?: boolean } = {}): Promise<League[]> {
  const rows = await many<{ id: string; country: string; name: string; provider: 'espn' | 'lpf'; provider_key: string; priority: number; top10: boolean }>(
    `SELECT id, country, name, provider, provider_key, priority, top10 FROM leagues WHERE ${opts.includeDisabled ? 'true' : 'enabled'} ${opts.top10Only === false ? '' : 'AND top10'} ORDER BY priority`,
  );
  return rows.map((r) => ({ id: r.id, country: r.country, name: r.name, provider: r.provider, providerKey: r.provider_key, priority: r.priority, top10: r.top10 }));
}

/**
 * Real provider: ESPN per league and match day (the league calendar skips idle days); Romania from the official LPF page.
 * The day before the window is read too: ESPN files late-evening games under the US day, i.e. our previous date.
 */
export const liveProvider: FixtureProvider = async (leagues, days) => {
  const errors: string[] = [];
  const espnDays = [shiftDay(days[0], -1), ...days];
  const nowDay = localDate();
  const ttlFor = (d: string) => (d <= shiftDay(nowDay, 1) ? 10 * 60_000 : 60 * 60_000);
  const tasks: Array<() => Promise<Fixture[]>> = [];
  await Promise.all(leagues.map(async (league) => {
    if (league.provider === 'pandascore') return; // Counter-Strike: stored by the CS sync, read from the database
    if (league.provider === 'lpf') { tasks.push(() => lpfFixtures(league, days).catch((e: Error) => { errors.push(`${league.name}: ${e.message}`); return [] as Fixture[]; })); return; }
    const calendar = await espnMatchDays(league).catch(() => null);
    for (const d of espnDays) {
      if (calendar && !calendar.has(yyyymmdd(d))) continue;
      tasks.push(() => espnLeagueDay(league, yyyymmdd(d), ttlFor(d)).catch((e: Error) => { errors.push(`${league.name} ${d}: ${e.message}`); return [] as Fixture[]; }));
    }
  }));
  // The HTTP layer paces ESPN globally; a small pool keeps requests flowing without bursts.
  const results: Fixture[][] = [];
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => { while (next < tasks.length) { const t = tasks[next++]; results.push(await t()); } }));
  const daySet = new Set(days);
  const unique = new Map<string, Fixture>();
  for (const f of results.flat()) if (daySet.has(localDate(new Date(f.kickoff)))) unique.set(f.id, f);
  return { fixtures: [...unique.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff)), errors };
};

function shiftDay(day: string, delta: number) {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Stored on globalThis so every Next.js server bundle sees the same override (tests only).
const g = globalThis as unknown as { __bmFixtureOverride?: FixtureProvider | null };
/** Tests inject a synthetic provider. Production code never calls this. */
export function setFixtureProviderForTests(p: FixtureProvider | null) {
  g.__bmFixtureOverride = p;
}
export const activeProvider = () => g.__bmFixtureOverride ?? liveProvider;

/** Persists fixtures/odds only when their content changed (no rewriting of unchanged rows). */
export async function persistFixtures(fixtures: Fixture[]) {
  const writes:import('../d1/client').Statement[]=[];
  const write=isD1()?async(text:string,params:unknown[])=>{writes.push({text,params});}:query;
  for (const f of fixtures) {
    const contentHash = hash([f.home, f.away, f.kickoff, f.status, f.homeScore, f.awayScore, f.clock ?? null]);
    await write(
      `INSERT INTO fixtures (id, provider, provider_id, league_id, home_team, away_team, home_team_id, away_team_id, home_logo, away_logo, kickoff_utc, status, home_score, away_score, content_hash, source_observed_at, live_clock)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO UPDATE SET home_team=EXCLUDED.home_team, away_team=EXCLUDED.away_team, kickoff_utc=EXCLUDED.kickoff_utc,
         status=EXCLUDED.status, home_score=EXCLUDED.home_score, away_score=EXCLUDED.away_score, content_hash=EXCLUDED.content_hash, source_observed_at=EXCLUDED.source_observed_at, live_clock=EXCLUDED.live_clock,
         updated_at=CASE WHEN fixtures.content_hash IS DISTINCT FROM EXCLUDED.content_hash THEN ${SQL_NOW()} ELSE fixtures.updated_at END
       WHERE (fixtures.source_observed_at IS NULL OR EXCLUDED.source_observed_at>=fixtures.source_observed_at)
         AND NOT (fixtures.status='post' AND EXCLUDED.status IN ('pre','in'))
         ${isD1()? 'AND fixtures.content_hash IS DISTINCT FROM EXCLUDED.content_hash':''}`,
      [f.id, f.provider, f.providerId, f.leagueId, f.home, f.away, f.homeTeamId ?? null, f.awayTeamId ?? null, f.homeLogo ?? null, f.awayLogo ?? null, f.kickoff, f.status, f.homeScore ?? null, f.awayScore ?? null, contentHash, f.fetchedAt, f.clock ?? null],
    );
    // The current prices of a fixture are its LAST saved snapshot (by id), not the one observed most recently:
    // merged prices keep the time their main source observed them (The Odds API cache, an imported export).
    if (f.odds) {
      const oddsHash = hash([f.odds.bookmaker, f.odds.markets]);
      await write(
        `INSERT INTO odds_snapshots (fixture_id, bookmaker, source, markets, observed_at, provider_updated_at, content_hash)
         SELECT $1,$2,$3,$4,$5,$6,$7
         WHERE NOT EXISTS (SELECT 1 FROM (SELECT content_hash FROM odds_snapshots WHERE fixture_id=$1 ORDER BY id DESC LIMIT 1) last WHERE last.content_hash=$7)`,
        [f.id, f.odds.bookmaker, f.odds.source, JSON.stringify(f.odds.markets), f.odds.observedAt, f.odds.providerUpdatedAt, oddsHash],
      );
    }
  }
  for(let i=0;i<writes.length;i+=20)await atomic(writes.slice(i,i+20));
}

/** Stored Counter-Strike fixtures of the window, each with its latest saved prices. */
async function storedCsFixtures(window: string[]): Promise<Fixture[]> {
  const first = window[0], last = window[window.length - 1];
  const from = new Date(Date.parse(`${first}T00:00:00Z`) - 3 * 3600_000).toISOString(), to = new Date(Date.parse(`${last}T23:59:59Z`) + 3 * 3600_000).toISOString();
  const rows = await many<{ id: string; provider_id: string; home_team: string; away_team: string; home_team_id: string | null; away_team_id: string | null; home_logo: string | null; away_logo: string | null; kickoff_utc: string | Date; status: Fixture['status']; home_score: number | null; away_score: number | null; bookmaker: string | null; source: string | null; markets: unknown; observed_at: string | Date | null; provider_updated_at: string | Date | null }>(
    `SELECT f.id,f.provider_id,f.home_team,f.away_team,f.home_team_id,f.away_team_id,f.home_logo,f.away_logo,f.kickoff_utc,f.status,f.home_score,f.away_score,o.bookmaker,o.source,o.markets,o.observed_at,o.provider_updated_at
       FROM fixtures f LEFT JOIN odds_snapshots o ON o.id=(SELECT id FROM odds_snapshots WHERE fixture_id=f.id ORDER BY id DESC LIMIT 1)
      WHERE f.provider='pandascore' AND f.kickoff_utc >= $1 AND f.kickoff_utc <= $2`, [from, to]);
  const daySet = new Set(window);
  return rows.filter((r) => daySet.has(localDate(new Date(r.kickoff_utc)))).map((r) => ({
    id: r.id, provider: 'pandascore', providerId: r.provider_id, leagueId: 'CS2', leagueKey: 'csgo', leagueName: 'Counter-Strike 2', country: 'Esports',
    home: r.home_team, away: r.away_team, homeTeamId: r.home_team_id ?? undefined, awayTeamId: r.away_team_id ?? undefined, homeLogo: r.home_logo ?? undefined, awayLogo: r.away_logo ?? undefined,
    kickoff: new Date(r.kickoff_utc).toISOString(), status: r.status, homeScore: r.home_score, awayScore: r.away_score, fetchedAt: new Date().toISOString(),
    odds: r.markets && r.bookmaker && r.observed_at ? { bookmaker: r.bookmaker, source: r.source ?? '', markets: (typeof r.markets === 'string' ? JSON.parse(r.markets) : r.markets) as MarketQuote[], observedAt: new Date(r.observed_at).toISOString(), providerUpdatedAt: r.provider_updated_at ? new Date(r.provider_updated_at).toISOString() : null } : null,
  }));
}

/** Fixtures for a window of local days. Cached by the HTTP layer; DB writes only on change. */
export async function loadFixtures(startDate: string, days: number, opts: { top10Only?: boolean; persist?: boolean; leagueIds?: string[] } = {}) {
  if(process.env.BETMIND_RUNTIME?.startsWith('cloudflare')&&!g.__bmFixtureOverride){
    const {storedCatalog}=await import('../d1/catalog');
    const {data}=await storedCatalog(startDate,days);
    const leagues=(opts.top10Only??true)?data.leagues.filter(l=>l.top10):data.leagues;
    const allowed=new Set(leagues.map(l=>l.id));
    return {...data,leagues,fixtures:data.fixtures.filter(f=>allowed.has(f.leagueId))};
  }
  // A custom ticket limited to some leagues fetches only those (31.10: all ~100 leagues × 3 days stalled discovery).
  const only = opts.leagueIds?.length ? new Set(opts.leagueIds) : null;
  const leagues = (await getLeagues({ top10Only: only ? false : opts.top10Only ?? true })).filter((l) => !only || only.has(l.id));
  const window = dateRange(startDate, days);
  const provided = await activeProvider()(leagues, window);
  const { errors } = provided;
  // Fixtures without any price at ESPN/LPF get The Odds API prices when available (cached, credit-budgeted).
  const football = g.__bmFixtureOverride ? provided.fixtures : await withTheOddsPrices(provided.fixtures).catch(() => provided.fixtures);
  // Counter-Strike fixtures come from the CS sync (PandaScore + OddsPapi), already stored with their latest prices.
  const priced = leagues.some((l) => l.provider === 'pandascore') ? [...football, ...(await storedCsFixtures(window).catch(() => []))] : football;
  // Odds the owner imported from his Stake export (no network): main prices for 4 days after the export.
  const fixtures = await withImportedPrices(priced).catch(() => priced);
  if (opts.persist !== false) await persistFixtures(fixtures);
  return { fixtures, errors, leagues, days: window, fetchedAt: new Date().toISOString() };
}
