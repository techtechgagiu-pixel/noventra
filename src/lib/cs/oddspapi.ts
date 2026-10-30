import { many, one, query } from '../db';
import { sportsGet } from '../sports/http';
import { persistFixtures } from '../sports/fixtures';
import { withImportedPrices } from '../sports/imported-prices';
import type { Fixture, MarketQuote } from '../sports/types';
import { csQuote, swapSide } from './markets';
import { sameCsMatch } from './teams';

/**
 * OddsPapi (free REST tier): CS2 prices from many bookmakers (sportId 17). The median price per selection is used,
 * like The Odds API for football. Key in ODDSPAPI_KEY, server only.
 * Markets: 171 match winner; total maps (2.5 line); maps handicap ±1.5. Handicap rungs share one name, so the
 * market catalogue (cached weekly) gives each id its line and each outcome its name ("1"/"2", "Over"/"Under").
 */
const BASE = 'https://api.oddspapi.io/v4';
const SPORT = '17';
export const ODDSPAPI_SOURCE = 'oddspapi';
const key = () => process.env.ODDSPAPI_KEY?.trim() || '';
export const oddspapiConfigured = () => !!key();

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r2 = (x: number) => Math.round(x * 100) / 100;

export type MarketDef = { id: string; name: string; handicap: number | null; outcomes: Record<string, string> };
export type OddsFixture = { id: string; home: string; away: string; kickoff: string; tournament: string | null };

/** Pure: /markets catalogue → CS2 market definitions we can settle (winner, total maps, maps handicap; x.5 lines). */
export function parseMarketCatalog(raw: unknown): MarketDef[] {
  return arr(raw).map(obj).filter((m) => str(m.sportId) === SPORT).map((m) => ({
    id: str(m.marketId), name: str(m.marketName), handicap: m.handicap === null || m.handicap === undefined || m.handicap === '' ? null : Number(m.handicap),
    outcomes: Object.fromEntries(arr(m.outcomes).map(obj).map((o) => [str(o.outcomeId), str(o.outcomeName)])),
  })).filter((m) => m.id && /winner|total maps|maps handicap/i.test(m.name) && !/^map \d/i.test(m.name));
}

/** Pure: /fixtures → CS2 fixtures with both team names and a start time. */
export function parseOddsFixtures(raw: unknown): OddsFixture[] {
  const list = Array.isArray(raw) ? raw : arr(obj(raw).data);
  return list.map(obj).flatMap((f) => {
    let home = str(f.participant1Name), away = str(f.participant2Name);
    if (!home || !away) [home, away] = str(f.fixtureName ?? f.name).split(/\s+v(?:s)?\.?\s+/i);
    const at = str(f.startTime ?? f.trueStartTime ?? f.startDate);
    if (!str(f.fixtureId) || !home || !away || !Number.isFinite(Date.parse(at))) return [];
    return [{ id: str(f.fixtureId), home: home.trim(), away: away.trim(), kickoff: new Date(at).toISOString(), tournament: str(f.tournamentName) || null }];
  });
}

/** Pure: /odds for one fixture → our keys (oriented to participant1 = HOME), median over real bookmakers. */
export function parseOddsBoard(raw: unknown, catalog: MarketDef[]): Array<{ key: string; odds: number; books: number }> {
  const defs = new Map(catalog.map((d) => [d.id, d]));
  const prices = new Map<string, number[]>();
  const add = (k: string, p: number) => { if (p > 1.01 && p < 100) prices.set(k, [...(prices.get(k) ?? []), p]); };
  const books = obj(obj(raw).bookmakerOdds);
  for (const [slug, b] of Object.entries(books)) {
    if (slug.includes('+') || slug === 'demo' || obj(b).suspended === true) continue;
    for (const [marketId, m] of Object.entries(obj(obj(b).markets))) {
      const def = defs.get(marketId);
      if (!def || obj(m).marketActive === false) continue;
      for (const [outcomeId, o] of Object.entries(obj(obj(m).outcomes))) {
        const p = obj(obj(obj(o).players)['0']);
        if (p.active === false) continue;
        const price = Number(p.price), name = (def.outcomes[outcomeId] ?? '').toLowerCase();
        if (/winner/i.test(def.name) && !/map/i.test(def.name)) { if (name === '1') add('ML:HOME', price); else if (name === '2') add('ML:AWAY', price); }
        else if (/total maps/i.test(def.name) && def.handicap !== null && Math.abs(def.handicap % 1) === 0.5) { if (name.startsWith('over')) add(`MT:OVER:${def.handicap}`, price); else if (name.startsWith('under')) add(`MT:UNDER:${def.handicap}`, price); }
        else if (/maps handicap/i.test(def.name) && def.handicap !== null && Math.abs(def.handicap % 1) === 0.5) {
          // The rung's handicap applies to participant 1; participant 2 gets the opposite line.
          if (name === '1') add(`MH:HOME:${def.handicap}`, price); else if (name === '2') add(`MH:AWAY:${-def.handicap}`, price);
        }
      }
    }
  }
  return [...prices].map(([k, xs]) => ({ key: k, odds: r2(median(xs)), books: xs.length }));
}

async function get(path: string, params: Record<string, string>, ttlMs: number) {
  const url = new URL(BASE + path);
  url.search = new URLSearchParams({ ...params, apiKey: key() }).toString();
  return sportsGet(url.toString(), { provider: 'oddspapi', ttlMs, timeoutMs: 20_000 });
}

async function marketCatalog(): Promise<MarketDef[]> {
  const row = await one<{ payload: { at: string; defs: MarketDef[] } }>("SELECT payload FROM sports_catalog_cache WHERE provider='oddspapi-markets'").catch(() => null);
  if (row?.payload?.defs?.length && Date.now() - Date.parse(row.payload.at) < 7 * 86400_000) return row.payload.defs;
  const defs = parseMarketCatalog(await get('/markets', {}, 3600_000));
  await query(`INSERT INTO sports_catalog_cache(provider,payload,next_attempt_at) VALUES('oddspapi-markets',$1,$2) ON CONFLICT(provider) DO UPDATE SET payload=$1`, [JSON.stringify({ at: new Date().toISOString(), defs }), new Date()]);
  return defs;
}

type Cached = { at: string; byFixture: Record<string, { at: string; markets: Array<{ key: string; odds: number; books: number }>; home: string; away: string; kickoff: string }> };
const FRESH_MS = 6 * 3600_000;

/**
 * Prices for the CS fixtures starting in the next 72 hours: one /fixtures call, then one /odds call per matched fixture
 * whose cached prices are older than 6 hours. Stake prices from the owner's export become main where they exist.
 */
export async function syncCsOdds(now = new Date()) {
  if (!oddspapiConfigured()) return { skipped: 'ODDSPAPI_KEY lipsește' };
  const ours = await many<{ id: string; home_team: string; away_team: string; kickoff_utc: string | Date; provider_id: string; home_team_id: string | null; away_team_id: string | null; home_logo: string | null; away_logo: string | null }>(
    `SELECT id,home_team,away_team,kickoff_utc,provider_id,home_team_id,away_team_id,home_logo,away_logo FROM fixtures WHERE provider='pandascore' AND status='pre' AND kickoff_utc > $1 AND kickoff_utc < $2`,
    [now.toISOString(), new Date(now.getTime() + 72 * 3600_000).toISOString()]);
  if (!ours.length) return { fixtures: 0 };
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const listed = parseOddsFixtures(await get('/fixtures', { sportId: SPORT, from: day(now), to: day(new Date(now.getTime() + 4 * 86400_000)) }, 30 * 60_000));
  const catalog = await marketCatalog();
  const row = await one<{ payload: Cached }>("SELECT payload FROM sports_catalog_cache WHERE provider='oddspapi-cs'").catch(() => null);
  const cache: Cached = { at: now.toISOString(), byFixture: Object.fromEntries(Object.entries(row?.payload?.byFixture ?? {}).filter(([, v]) => Date.parse(v.kickoff) > now.getTime() - 6 * 3600_000)) };
  let calls = 0; const priced: Fixture[] = [];
  for (const f of ours) {
    const mine = { home: f.home_team, away: f.away_team, kickoff: new Date(f.kickoff_utc).toISOString() };
    let orient: 'same' | 'swapped' | null = null;
    const hit = listed.find((x) => (orient = sameCsMatch(mine, x)));
    if (!hit || !orient) continue;
    let entry = cache.byFixture[hit.id];
    if ((!entry || now.getTime() - Date.parse(entry.at) >= FRESH_MS) && calls < 60) {
      calls++;
      try { entry = { at: now.toISOString(), markets: parseOddsBoard(await get('/odds', { fixtureId: hit.id }, 30 * 60_000), catalog), home: hit.home, away: hit.away, kickoff: hit.kickoff }; cache.byFixture[hit.id] = entry; }
      catch (e) { console.warn(JSON.stringify({ event: 'oddspapi_odds_failed', message: (e as Error).message.slice(0, 120) })); if (/429|401|403/.test((e as Error).message)) break; continue; }
    }
    if (!entry?.markets.length) continue;
    const books = Math.max(...entry.markets.map((m) => m.books));
    const book = `OddsPapi · mediana a ${books} case`;
    const quotes: MarketQuote[] = entry.markets.map((m) => csQuote(orient === 'swapped' ? swapSide(m.key) : m.key, m.odds, mine.home, mine.away));
    if (!quotes.some((q) => q.key === 'ML:HOME') || !quotes.some((q) => q.key === 'ML:AWAY')) continue;
    priced.push({ id: f.id, provider: 'pandascore', providerId: f.provider_id, leagueId: 'CS2', leagueKey: 'csgo', leagueName: 'Counter-Strike 2', country: 'Esports',
      home: mine.home, away: mine.away, homeTeamId: f.home_team_id ?? undefined, awayTeamId: f.away_team_id ?? undefined, homeLogo: f.home_logo ?? undefined, awayLogo: f.away_logo ?? undefined,
      kickoff: mine.kickoff, status: 'pre', odds: { bookmaker: book, source: ODDSPAPI_SOURCE, observedAt: entry.at, providerUpdatedAt: entry.at, markets: quotes }, fetchedAt: now.toISOString() });
  }
  await query(`INSERT INTO sports_catalog_cache(provider,payload,next_attempt_at) VALUES('oddspapi-cs',$1,$2) ON CONFLICT(provider) DO UPDATE SET payload=$1`, [JSON.stringify(cache), new Date()]);
  // Stake (owner's export) is the main price where it covers the match; OddsPapi stays as background.
  const merged = await withImportedPrices(priced).catch(() => priced);
  await persistFixtures(merged);
  return { fixtures: ours.length, listed: listed.length, priced: priced.length, calls };
}
