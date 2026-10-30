import { many, one, dialect } from './db';
import { loadFixtures } from './sports/fixtures';
import { localDate } from './time';
import type { Fixture, MarketQuote } from './sports/types';
import { theOddsCatalog } from './sports/the-odds-catalog';
import { mergeInformationalMatches } from './sports/informational-matches';
import { cachedTheOddsEvents } from './sports/the-odds-prices';

/**
 * Every fixture the sources publish for the next days, shared by the "Meciuri" tab and the custom-ticket league picker.
 * Stale-while-revalidate: a reader gets the last snapshot at once and a refresh starts in the background; only the very
 * first read waits. Reading never triggers AI.
 */
type Snapshot = Awaited<ReturnType<typeof loadFixtures>>;
const g = globalThis as unknown as { __bmCatalog?: { data: Snapshot | null; at: number; running: Promise<void> | null } };
const state = (g.__bmCatalog ??= { data: null, at: 0, running: null });
const FRESH_MS = 10 * 60_000;
export const CATALOG_DAYS = 8;

export async function fixtureCatalog() {
  if(process.env.BETMIND_RUNTIME?.startsWith('cloudflare')){
    const {storedCatalog}=await import('./d1/catalog');
    return storedCatalog();
  }
  if ((!state.data || Date.now() - state.at > FRESH_MS || state.data.days[0] !== localDate()) && !state.running) {
    state.running = loadFixtures(localDate(), CATALOG_DAYS, { top10Only: false, persist: false })
      .then((d) => { state.data = d; state.at = Date.now(); })
      .catch((e) => { console.warn(JSON.stringify({ event: 'catalog_failed', message: (e as Error).message })); })
      .finally(() => { state.running = null; });
  }
  // A cold catalog must not hold the HTTP request open through every league/source retry.
  // The client already polls while refreshing; keep the shared background refresh alive.
  if (!state.data && state.running) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([state.running, new Promise<void>((resolve) => { timer = setTimeout(resolve, 1500); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  return { data: state.data, refreshing: !!state.running, at: state.at };
}

export type MatchRow = {
  source?: 'espn' | 'lpf' | 'the-odds-api' | 'demo' | 'pandascore';
  sources?: Array<'espn' | 'lpf' | 'the-odds-api' | 'demo' | 'pandascore'>;
  id: string; leagueId: string; league: string; country: string; home: string; away: string; homeLogo: string | null; awayLogo: string | null;
  kickoff: string; status: string; score: string | null; odds: { home: number | null; draw: number | null; away: number | null; markets: number; bookmaker: string } | null;
  analysis: { outcome: string; selectionOutcome: string | null; label: string | null; odds: number | null; votes: number; onTicket: boolean; at: string; jobId: string } | null;
};

/** Shared annotations: prefer a saved ticket, otherwise the latest team decision; never trigger AI. */
export async function matchList(userId: string, scope: 'all' | 'mine' = 'all', includeInformational = false) {
  // Only the informational Meciuri view opts in. Custom and the shared fixture catalog remain unchanged.
  const [{ data, refreshing, at }, additional] = await Promise.all([fixtureCatalog(), theOddsCatalog(localDate(), CATALOG_DAYS, includeInformational)]);
  const fixtures: Fixture[] = data?.fixtures ?? [];
  const ids = fixtures.map((f) => f.id);
  const decided = ids.length ? await many<{ fixture_id: string; outcome: string; selection_outcome: string | null; market_key: string | null; votes_for: number; created_at: Date; job_id: string; label: string | null; odds: string | null; on_ticket: boolean }>(
    `SELECT * FROM (SELECT fd.fixture_id, fd.outcome, fd.market_key, fd.votes_for, fd.created_at, fd.job_id,
            COALESCE(ts.market_label, (SELECT p.payload->>'marketLabel' FROM agent_predictions p WHERE p.job_id=fd.job_id AND p.fixture_id=fd.fixture_id AND p.market_key=fd.market_key AND NULLIF(p.payload->>'marketLabel','') IS NOT NULL ORDER BY p.round DESC,p.id DESC LIMIT 1)) AS label,
            COALESCE(ts.odds, (SELECT p.odds FROM agent_predictions p WHERE p.job_id=fd.job_id AND p.fixture_id=fd.fixture_id AND p.market_key=fd.market_key AND p.odds IS NOT NULL LIMIT 1)) AS odds,
            ts.ticket_id IS NOT NULL AS on_ticket, ts.outcome AS selection_outcome,
            ROW_NUMBER() OVER(PARTITION BY fd.fixture_id ORDER BY (ts.ticket_id IS NOT NULL) DESC,fd.created_at DESC,fd.id DESC) AS rank
     FROM final_decisions fd JOIN ticket_generation_jobs j ON j.id=fd.job_id
     LEFT JOIN tickets t ON t.job_id=fd.job_id LEFT JOIN ticket_selections ts ON ts.ticket_id=t.id AND ts.fixture_id=fd.fixture_id
     WHERE (${dialect('$1::uuid','$1')} IS NULL OR j.user_id=$1) AND ${dialect('fd.fixture_id = ANY($2)','fd.fixture_id IN (SELECT value FROM json_each($2))')}) ranked
     WHERE rank=1 ORDER BY fixture_id`, [scope === 'mine' ? userId : null, ids]) : [];
  // Resolve missing display labels in one bounded snapshot read, after DISTINCT has selected
  // the decisions. Do not expand every snapshot's JSON inside the correlated SQL projection.
  const missing = decided.filter((d) => !d.label && d.market_key);
  const snapshots = missing.length ? await many<{ job_id: string; fixture_id: string; markets: Array<{ key: string; label: string }> | null }>(
    `SELECT job_id,fixture_id,markets FROM (SELECT job_id,fixture_id,payload->'model'->'markets' AS markets,ROW_NUMBER() OVER(PARTITION BY job_id,fixture_id ORDER BY id DESC) AS rank
     FROM fixture_snapshots WHERE ${dialect('job_id=ANY($1::uuid[])','job_id IN (SELECT value FROM json_each($1))')} AND ${dialect('fixture_id=ANY($2::text[])','fixture_id IN (SELECT value FROM json_each($2))')}) ranked
     WHERE rank=1 ORDER BY job_id,fixture_id`, [[...new Set(missing.map((d) => d.job_id))], [...new Set(missing.map((d) => d.fixture_id))]]) : [];
  const labels = new Map(snapshots.flatMap((s) => (Array.isArray(s.markets) ? s.markets : []).map((m) => [`${s.job_id}|${s.fixture_id}|${m.key}`,m.label] as const)));
  const saved = ids.length ? await many<{ id: string; kickoff_utc: Date; status: string; home_score: number | null; away_score: number | null; source_observed_at: Date | null }>(
    `SELECT id,kickoff_utc,status,home_score,away_score,source_observed_at FROM fixtures WHERE ${dialect('id=ANY($1)','id IN (SELECT value FROM json_each($1))')}`,[ids]) : [];
  const stored = new Map(saved.map((f) => [f.id,f]));
  const byFixture = new Map(decided.map((d) => [d.fixture_id, d]));
  const price = (f: Fixture, key: string) => f.odds?.markets.find((m) => m.key === key)?.odds ?? null;
  const rows: MatchRow[] = fixtures.map((f) => {
    const d = byFixture.get(f.id), cached = stored.get(f.id);
    const useStored = !!cached && ((cached.status === 'post' && f.status !== 'post') || (cached.source_observed_at !== null && cached.source_observed_at.getTime() > Date.parse(f.fetchedAt)));
    const status = useStored ? cached.status : f.status;
    const kickoff = useStored ? cached.kickoff_utc.toISOString() : f.kickoff;
    const homeScore = useStored ? cached.home_score : f.homeScore, awayScore = useStored ? cached.away_score : f.awayScore;
    return {
      source: f.provider,
      id: f.id, leagueId: f.leagueId, league: f.leagueName, country: f.country, home: f.home, away: f.away, homeLogo: f.homeLogo ?? null, awayLogo: f.awayLogo ?? null,
      kickoff, status, score: homeScore != null && awayScore != null ? `${homeScore}–${awayScore}` : null,
      // Counter-Strike has no draw: the row shows the match-winner prices (1 / 2).
      odds: f.odds ? (f.provider === 'pandascore'
        ? { home: price(f, 'ML:HOME'), draw: null, away: price(f, 'ML:AWAY'), markets: f.odds.markets.length, bookmaker: f.odds.bookmaker }
        : { home: price(f, '1X2:HOME'), draw: price(f, '1X2:DRAW'), away: price(f, '1X2:AWAY'), markets: f.odds.markets.length, bookmaker: f.odds.bookmaker }) : null,
      analysis: d ? { outcome: d.outcome, selectionOutcome: d.selection_outcome, label: d.label ?? labels.get(`${d.job_id}|${d.fixture_id}|${d.market_key}`) ?? d.market_key, odds: d.odds === null ? null : Number(d.odds), votes: d.votes_for, onTicket: d.on_ticket, at: new Date(d.created_at).toISOString(), jobId: d.job_id } : null,
    };
  });
  const leagues = (data?.leagues ?? []).map((l) => ({ id: l.id, name: l.name, country: l.country, top10: l.top10, count: rows.filter((r) => r.leagueId === l.id).length }));
  const merged = mergeInformationalMatches(rows, additional.fixtures);
  // Schedule-only competitions: show The Odds API prices when they are cached (no new credits spent here).
  if (includeInformational && merged.some((m) => m.source === 'the-odds-api')) {
    const events = new Map<string, Awaited<ReturnType<typeof cachedTheOddsEvents>>[string]['events'][number]>(Object.values(await cachedTheOddsEvents().catch(() => ({}))).flatMap((c) => c.events.map((e) => [`the-odds-api:${e.id}`, e] as [string, typeof e])));
    for (const m of merged) {
      const e = m.source === 'the-odds-api' ? events.get(m.id) : undefined;
      if (!e) continue;
      const p = (k: string) => e.markets.find((x) => x.key === k)?.odds ?? null;
      m.odds = { home: p('1X2:HOME'), draw: p('1X2:DRAW'), away: p('1X2:AWAY'), markets: e.markets.length, bookmaker: `The Odds API · mediana a ${e.books} case` };
    }
  }
  for (const m of merged) {
    if (!leagues.some((l) => l.id === m.leagueId)) leagues.push({ id: m.leagueId, name: m.league, country: m.country, top10: false, count: 0 });
  }
  const counts = new Map<string, number>();
  for (const m of merged) counts.set(m.leagueId, (counts.get(m.leagueId) ?? 0) + 1);
  return { rows: merged, leagues: leagues.map((l) => ({ ...l, count: counts.get(l.id) ?? 0 })), refreshing: refreshing || additional.source.refreshing,
    scope, updatedAt: at ? new Date(at).toISOString() : null, errors: (data?.errors ?? []).length, additionalSource: additional.source };
}

/** All stored markets for one match (Meciuri: expand a row). Reads the last saved prices only. */
export async function matchMarkets(id: string): Promise<{ bookmaker: string | null; observedAt: string | null; markets: MarketQuote[] }> {
  if (id.startsWith('the-odds-api:')) {
    for (const c of Object.values(await cachedTheOddsEvents().catch(() => ({})))) {
      const e = c.events.find((x) => `the-odds-api:${x.id}` === id);
      if (e) return { bookmaker: `The Odds API · mediana a ${e.books} case`, observedAt: c.at, markets: e.markets.map((m) => ({ ...m, bookmaker: m.bookmaker ?? 'The Odds API' })) };
    }
    return { bookmaker: null, observedAt: null, markets: [] };
  }
  const row = await one<{ bookmaker: string; markets: MarketQuote[] | string; observed_at: Date | string }>('SELECT bookmaker, markets, observed_at FROM odds_snapshots WHERE fixture_id=$1 ORDER BY id DESC LIMIT 1', [id]);
  if (!row) return { bookmaker: null, observedAt: null, markets: [] };
  const markets = (typeof row.markets === 'string' ? JSON.parse(row.markets) : row.markets) as MarketQuote[];
  return { bookmaker: row.bookmaker, observedAt: new Date(row.observed_at).toISOString(), markets: markets.map((m) => ({ ...m, bookmaker: m.bookmaker ?? row.bookmaker })) };
}
