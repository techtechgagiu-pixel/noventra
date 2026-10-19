import { createHash } from 'node:crypto';
import { many, query } from '../db';
import { dateRange, localDate, yyyymmdd } from '../time';
import { espnLeagueDay } from './espn';
import { lpfFixtures } from './lpf';
import type { Fixture, League } from './types';

export type FixtureProvider = (leagues: League[], days: string[]) => Promise<{ fixtures: Fixture[]; errors: string[] }>;

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 32);

export async function getLeagues(opts: { top10Only?: boolean } = {}): Promise<League[]> {
  const rows = await many<{ id: string; country: string; name: string; provider: 'espn' | 'lpf'; provider_key: string; priority: number; top10: boolean }>(
    `SELECT id, country, name, provider, provider_key, priority, top10 FROM leagues WHERE enabled ${opts.top10Only === false ? '' : 'AND top10'} ORDER BY priority`,
  );
  return rows.map((r) => ({ id: r.id, country: r.country, name: r.name, provider: r.provider, providerKey: r.provider_key, priority: r.priority, top10: r.top10 }));
}

/** Real provider: ESPN per league/day; Romania from the official LPF page. */
export const liveProvider: FixtureProvider = async (leagues, days) => {
  const errors: string[] = [];
  const tasks = leagues.flatMap((league) =>
    league.provider === 'lpf'
      ? [lpfFixtures(league, days).catch((e: Error) => { errors.push(`${league.name}: ${e.message}`); return [] as Fixture[]; })]
      : days.map((d) => espnLeagueDay(league, yyyymmdd(d)).catch((e: Error) => { errors.push(`${league.name} ${d}: ${e.message}`); return [] as Fixture[]; })),
  );
  const results: Fixture[][] = [];
  // Bounded concurrency to stay polite with the public source.
  for (let i = 0; i < tasks.length; i += 8) results.push(...(await Promise.all(tasks.slice(i, i + 8))));
  const daySet = new Set(days);
  const unique = new Map<string, Fixture>();
  for (const f of results.flat()) if (daySet.has(localDate(new Date(f.kickoff)))) unique.set(f.id, f);
  return { fixtures: [...unique.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff)), errors };
};

// Stored on globalThis so every Next.js server bundle sees the same override (tests only).
const g = globalThis as unknown as { __bmFixtureOverride?: FixtureProvider | null };
/** Tests inject a synthetic provider. Production code never calls this. */
export function setFixtureProviderForTests(p: FixtureProvider | null) {
  g.__bmFixtureOverride = p;
}
export const activeProvider = () => g.__bmFixtureOverride ?? liveProvider;

/** Persists fixtures/odds only when their content changed (no rewriting of unchanged rows). */
export async function persistFixtures(fixtures: Fixture[]) {
  for (const f of fixtures) {
    const contentHash = hash([f.home, f.away, f.kickoff, f.status, f.homeScore, f.awayScore]);
    await query(
      `INSERT INTO fixtures (id, provider, provider_id, league_id, home_team, away_team, home_team_id, away_team_id, home_logo, away_logo, kickoff_utc, status, home_score, away_score, content_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET home_team=EXCLUDED.home_team, away_team=EXCLUDED.away_team, kickoff_utc=EXCLUDED.kickoff_utc,
         status=EXCLUDED.status, home_score=EXCLUDED.home_score, away_score=EXCLUDED.away_score, content_hash=EXCLUDED.content_hash, updated_at=now()
       WHERE fixtures.content_hash IS DISTINCT FROM EXCLUDED.content_hash`,
      [f.id, f.provider, f.providerId, f.leagueId, f.home, f.away, f.homeTeamId ?? null, f.awayTeamId ?? null, f.homeLogo ?? null, f.awayLogo ?? null, f.kickoff, f.status, f.homeScore ?? null, f.awayScore ?? null, contentHash],
    );
    if (f.odds) {
      const oddsHash = hash([f.odds.bookmaker, f.odds.markets]);
      await query(
        `INSERT INTO odds_snapshots (fixture_id, bookmaker, source, markets, observed_at, provider_updated_at, content_hash)
         SELECT $1,$2,$3,$4,$5,$6,$7
         WHERE NOT EXISTS (SELECT 1 FROM (SELECT content_hash FROM odds_snapshots WHERE fixture_id=$1 ORDER BY observed_at DESC LIMIT 1) last WHERE last.content_hash=$7)`,
        [f.id, f.odds.bookmaker, f.odds.source, JSON.stringify(f.odds.markets), f.odds.observedAt, f.odds.providerUpdatedAt, oddsHash],
      );
    }
  }
}

/** Fixtures for a window of local days. Cached by the HTTP layer; DB writes only on change. */
export async function loadFixtures(startDate: string, days: number, opts: { top10Only?: boolean; persist?: boolean } = {}) {
  const leagues = await getLeagues({ top10Only: opts.top10Only ?? true });
  const window = dateRange(startDate, days);
  const { fixtures, errors } = await activeProvider()(leagues, window);
  if (opts.persist !== false) await persistFixtures(fixtures);
  return { fixtures, errors, leagues, days: window, fetchedAt: new Date().toISOString() };
}
