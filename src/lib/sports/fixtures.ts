import { createHash } from 'node:crypto';
import { many, query, SQL_NOW, isD1, atomic } from '../db';
import { dateRange, localDate, yyyymmdd } from '../time';
import { espnLeagueDay, espnMatchDays } from './espn';
import { lpfFixtures } from './lpf';
import type { Fixture, League } from './types';
import { withTheOddsPrices } from './the-odds-prices';

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
    const contentHash = hash([f.home, f.away, f.kickoff, f.status, f.homeScore, f.awayScore]);
    await write(
      `INSERT INTO fixtures (id, provider, provider_id, league_id, home_team, away_team, home_team_id, away_team_id, home_logo, away_logo, kickoff_utc, status, home_score, away_score, content_hash, source_observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO UPDATE SET home_team=EXCLUDED.home_team, away_team=EXCLUDED.away_team, kickoff_utc=EXCLUDED.kickoff_utc,
         status=EXCLUDED.status, home_score=EXCLUDED.home_score, away_score=EXCLUDED.away_score, content_hash=EXCLUDED.content_hash, source_observed_at=EXCLUDED.source_observed_at,
         updated_at=CASE WHEN fixtures.content_hash IS DISTINCT FROM EXCLUDED.content_hash THEN ${SQL_NOW()} ELSE fixtures.updated_at END
       WHERE (fixtures.source_observed_at IS NULL OR EXCLUDED.source_observed_at>=fixtures.source_observed_at)
         AND NOT (fixtures.status='post' AND EXCLUDED.status IN ('pre','in'))
         ${isD1()? 'AND fixtures.content_hash IS DISTINCT FROM EXCLUDED.content_hash':''}`,
      [f.id, f.provider, f.providerId, f.leagueId, f.home, f.away, f.homeTeamId ?? null, f.awayTeamId ?? null, f.homeLogo ?? null, f.awayLogo ?? null, f.kickoff, f.status, f.homeScore ?? null, f.awayScore ?? null, contentHash, f.fetchedAt],
    );
    if (f.odds) {
      const oddsHash = hash([f.odds.bookmaker, f.odds.markets]);
      await write(
        `INSERT INTO odds_snapshots (fixture_id, bookmaker, source, markets, observed_at, provider_updated_at, content_hash)
         SELECT $1,$2,$3,$4,$5,$6,$7
         WHERE NOT EXISTS (SELECT 1 FROM (SELECT content_hash FROM odds_snapshots WHERE fixture_id=$1 ORDER BY observed_at DESC LIMIT 1) last WHERE last.content_hash=$7)`,
        [f.id, f.odds.bookmaker, f.odds.source, JSON.stringify(f.odds.markets), f.odds.observedAt, f.odds.providerUpdatedAt, oddsHash],
      );
    }
  }
  for(let i=0;i<writes.length;i+=20)await atomic(writes.slice(i,i+20));
}

/** Fixtures for a window of local days. Cached by the HTTP layer; DB writes only on change. */
export async function loadFixtures(startDate: string, days: number, opts: { top10Only?: boolean; persist?: boolean } = {}) {
  if(process.env.BETMIND_RUNTIME?.startsWith('cloudflare')&&!g.__bmFixtureOverride){
    const {storedCatalog}=await import('../d1/catalog');
    const {data}=await storedCatalog(startDate,days);
    const leagues=(opts.top10Only??true)?data.leagues.filter(l=>l.top10):data.leagues;
    const allowed=new Set(leagues.map(l=>l.id));
    return {...data,leagues,fixtures:data.fixtures.filter(f=>allowed.has(f.leagueId))};
  }
  const leagues = await getLeagues({ top10Only: opts.top10Only ?? true });
  const window = dateRange(startDate, days);
  const provided = await activeProvider()(leagues, window);
  const { errors } = provided;
  // Fixtures without any price at ESPN/LPF get The Odds API prices when available (cached, credit-budgeted).
  const fixtures = g.__bmFixtureOverride ? provided.fixtures : await withTheOddsPrices(provided.fixtures).catch(() => provided.fixtures);
  if (opts.persist !== false) await persistFixtures(fixtures);
  return { fixtures, errors, leagues, days: window, fetchedAt: new Date().toISOString() };
}
