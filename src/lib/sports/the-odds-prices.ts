import { one, query } from '../db';
import type { Fixture, MarketQuote } from './types';
import type { InformationalMatch } from './informational-matches';

/**
 * The Odds API is the MAIN price source (user decision 26.10): its median price across the listed bookmakers is used
 * for every market it publishes (1X2 and goal totals at every .5 line), and ESPN/LPF prices stay in the background
 * for the markets The Odds API does not cover (double chance, BTTS, corners, halves, handicaps…). Every agent gets
 * the merged menu, each price tagged with its source. Nothing is derived: no double chance computed from 1X2.
 *
 * Free plan (500 credits/month; 2 credits per competition per call, football only):
 * - each competition is fetched at most once every 3 days and cached in the database (shared by every job),
 * - competitions with the most fixtures we analyse go first, then the big leagues,
 * - a daily allowance = remaining credits ÷ days left in the month, never below a 40-credit reserve.
 */
const PROVIDER = 'the-odds-api-prices';
const CATALOG = 'the-odds-api';
const FRESH_MS = 3 * 24 * 3600_000;
const COST = 2;
const RESERVE = 40;
/** Big competitions first when credits are short (after the ones holding our own fixtures). */
const PRIORITY = ['soccer_uefa_champs_league', 'soccer_epl', 'soccer_spain_la_liga', 'soccer_italy_serie_a', 'soccer_germany_bundesliga', 'soccer_france_ligue_one',
  'soccer_uefa_europa_league', 'soccer_uefa_europa_conference_league', 'soccer_netherlands_eredivisie', 'soccer_portugal_primeira_liga', 'soccer_romania_liga_1',
  'soccer_turkey_super_league', 'soccer_belgium_first_div', 'soccer_efl_champ', 'soccer_spl', 'soccer_greece_super_league', 'soccer_austria_bundesliga'];
const rank = (sport: string) => { const i = PRIORITY.indexOf(sport); return i < 0 ? PRIORITY.length : i; };

type Event = { id: string; home: string; away: string; kickoff: string; markets: MarketQuote[]; books: number };
type Payload = { bySport?: Record<string, { at: string; events: Event[] }>; day?: string; usedToday?: number; creditsRemaining?: number | null };

const words = (name: string) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ø/g, 'o').replace(/ł/g, 'l')
  .replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 3 && !['fc', 'afc', 'cf', 'sc', 'if', 'fk', 'ac', 'club', 'football', 'futbol', 'united', 'city', 'real', 'sporting', 'athletic', 'cfr', 'csm', 'acs'].includes(w));
const sameTeam = (a: string, b: string) => {
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return a.toLowerCase().trim() === b.toLowerCase().trim();
  return x.some((w) => y.some((v) => v === w || (w.length >= 5 && v.length >= 5 && (v.startsWith(w) || w.startsWith(v)))));
};
/** Same match: both teams recognisably the same, same home/away order, kickoff within 15 minutes. */
export const sameMatch = (f: { home: string; away: string; kickoff: string }, e: { home: string; away: string; kickoff: string }) =>
  Math.abs(Date.parse(f.kickoff) - Date.parse(e.kickoff)) <= 15 * 60_000 && sameTeam(f.home, e.home) && sameTeam(f.away, e.away);

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Pure: The Odds API `/odds` response → events with median prices per selection (decimal odds). */
export function parseTheOddsPrices(raw: unknown): Event[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    const r = (value ?? {}) as Record<string, unknown>;
    const id = String(r.id ?? ''), home = String(r.home_team ?? ''), away = String(r.away_team ?? ''), kickoff = String(r.commence_time ?? '');
    if (!id || !home || !away || !Number.isFinite(Date.parse(kickoff)) || !Array.isArray(r.bookmakers)) return [];
    const h2h: Record<'HOME' | 'DRAW' | 'AWAY', number[]> = { HOME: [], DRAW: [], AWAY: [] };
    const totals = new Map<number, { over: number[]; under: number[] }>();
    for (const b of r.bookmakers as Array<Record<string, unknown>>) {
      for (const m of (Array.isArray(b?.markets) ? b.markets : []) as Array<Record<string, unknown>>) {
        const outcomes = (Array.isArray(m?.outcomes) ? m.outcomes : []) as Array<Record<string, unknown>>;
        if (m.key === 'h2h') {
          for (const o of outcomes) {
            const price = Number(o.price), name = String(o.name ?? '');
            if (!(price > 1.01 && price < 100)) continue;
            if (name === home) h2h.HOME.push(price); else if (name === away) h2h.AWAY.push(price); else if (/^draw$/i.test(name)) h2h.DRAW.push(price);
          }
        } else if (m.key === 'totals') {
          for (const o of outcomes) {
            const price = Number(o.price), point = Number(o.point), name = String(o.name ?? '');
            if (!(price > 1.01 && price < 100) || !Number.isFinite(point) || Math.abs(point % 1) !== 0.5) continue;
            const t = totals.get(point) ?? { over: [], under: [] };
            if (/^over$/i.test(name)) t.over.push(price); else if (/^under$/i.test(name)) t.under.push(price);
            totals.set(point, t);
          }
        }
      }
    }
    const markets: MarketQuote[] = [];
    // A complete 1X2 only: three prices from the same listing, never a partial one.
    if (h2h.HOME.length && h2h.DRAW.length && h2h.AWAY.length) {
      markets.push({ key: '1X2:HOME', label: `${home} câștigă (1)`, marketType: '1X2', odds: r2(median(h2h.HOME)) });
      markets.push({ key: '1X2:DRAW', label: 'Egal (X)', marketType: '1X2', odds: r2(median(h2h.DRAW)) });
      markets.push({ key: '1X2:AWAY', label: `${away} câștigă (2)`, marketType: '1X2', odds: r2(median(h2h.AWAY)) });
    }
    for (const [line, t] of [...totals].sort((a, b) => a[0] - b[0])) {
      if (!t.over.length || !t.under.length) continue;
      markets.push({ key: `TOTAL:OVER:${line}`, label: `Peste ${line} goluri`, marketType: 'TOTAL', odds: r2(median(t.over)), line });
      markets.push({ key: `TOTAL:UNDER:${line}`, label: `Sub ${line} goluri`, marketType: 'TOTAL', odds: r2(median(t.under)), line });
    }
    return markets.length ? [{ id, home, away, kickoff: new Date(kickoff).toISOString(), markets, books: (r.bookmakers as unknown[]).length }] : [];
  });
}

const utcDay = () => new Date().toISOString().slice(0, 10);
const daysLeftInMonth = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() - d.getUTCDate() + 1; };

/** Cached Odds API events (no network). Used by the Meciuri tab for schedule-only competitions. */
export async function cachedTheOddsEvents(): Promise<Record<string, { at: string; events: Event[] }>> {
  const row = await one<{ payload: Payload }>('SELECT payload FROM sports_catalog_cache WHERE provider=$1', [PROVIDER]).catch(() => null);
  return row?.payload.bySport ?? {};
}

/** Merges The Odds API prices (main) with the fixture's own ESPN/LPF prices (background). */
export function mergeTheOdds(f: Fixture, e: Event, at: string): Fixture {
  const book = `The Odds API · mediana a ${e.books} case`;
  // Labels use the fixture's own team names, so the rest of the app sees one consistent match.
  const main = e.markets.map((m) => ({ ...m, bookmaker: book, label: m.key === '1X2:HOME' ? `${f.home} câștigă (1)` : m.key === '1X2:AWAY' ? `${f.away} câștigă (2)` : m.label }));
  const keys = new Set(main.map((m) => m.key));
  const background = (f.odds?.markets ?? []).filter((m) => !keys.has(m.key)).map((m) => ({ ...m, bookmaker: m.bookmaker ?? f.odds?.bookmaker }));
  return { ...f, odds: { bookmaker: book, source: 'the-odds-api', observedAt: at, providerUpdatedAt: at, markets: [...main, ...background] } };
}

/** Adds The Odds API prices to every listed fixture it covers (cached 3 days, credit-budgeted). */
export async function withTheOddsPrices(fixtures: Fixture[], opts: { fetchAllowed?: boolean } = {}): Promise<Fixture[]> {
  const open = fixtures.filter((f) => f.status === 'pre');
  if (!open.length) return fixtures;
  // Keep the free schedule (used to find each fixture's competition) current; it refreshes in the background.
  if (process.env.ODDS_API_KEY?.trim() && opts.fetchAllowed !== false) {
    const { theOddsCatalog } = await import('./the-odds-catalog');
    const { localDate } = await import('../time');
    await theOddsCatalog(localDate(), 8).catch(() => null);
  }
  const catalog = await one<{ payload: { byLeague?: Record<string, { fixtures: InformationalMatch[] }>; creditsRemaining?: number | null } }>('SELECT payload FROM sports_catalog_cache WHERE provider=$1', [CATALOG]).catch(() => null);
  const byLeague = catalog?.payload.byLeague ?? {};
  // Which competitions hold our fixtures (from the free schedule already cached).
  const needed = new Map<string, number>();
  const sportOf = new Map<string, string>();
  for (const f of open) {
    for (const [sport, d] of Object.entries(byLeague)) {
      if (d.fixtures.some((e) => sameMatch(f, e))) { sportOf.set(f.id, sport); needed.set(sport, (needed.get(sport) ?? 0) + 1); break; }
    }
  }
  // Big competitions are priced even without an ESPN counterpart, so the Meciuri tab shows their markets too.
  for (const [sport, d] of Object.entries(byLeague)) if (!needed.has(sport) && rank(sport) < PRIORITY.length && d.fixtures.some((x) => Date.parse(x.kickoff) > Date.now())) needed.set(sport, 0);
  const row = await one<{ payload: Payload }>('SELECT payload FROM sports_catalog_cache WHERE provider=$1', [PROVIDER]).catch(() => null);
  const payload: Payload = { bySport: {}, ...(row?.payload ?? {}) };
  payload.bySport = { ...payload.bySport };
  if (payload.day !== utcDay()) { payload.day = utcDay(); payload.usedToday = 0; }
  const key = process.env.ODDS_API_KEY?.trim();
  let changed = false;
  if (key && opts.fetchAllowed !== false && needed.size) {
    const remaining = payload.creditsRemaining ?? catalog?.payload.creditsRemaining ?? 500;
    const allowance = Math.max(0, Math.floor((remaining - RESERVE) / daysLeftInMonth()));
    const stale = [...needed].filter(([sport]) => { const c = payload.bySport![sport]; return !c || Date.now() - Date.parse(c.at) >= FRESH_MS; })
      .sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]));
    for (const [sport] of stale) {
      if ((payload.usedToday ?? 0) + COST > allowance) break;
      try {
        const url = new URL(`https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sport)}/odds`);
        url.search = new URLSearchParams({ apiKey: key, regions: 'eu', markets: 'h2h,totals', oddsFormat: 'decimal', dateFormat: 'iso' }).toString();
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
        const left = res.headers.get('x-requests-remaining'), last = res.headers.get('x-requests-last');
        if (left !== null && /^\d+(\.\d+)?$/.test(left)) payload.creditsRemaining = Number(left);
        payload.usedToday = (payload.usedToday ?? 0) + (last !== null && Number.isFinite(Number(last)) ? Number(last) : COST);
        changed = true;
        if (!res.ok) { console.warn(JSON.stringify({ event: 'the_odds_prices_failed', status: res.status })); if (res.status === 401 || res.status === 429) break; continue; }
        payload.bySport![sport] = { at: new Date().toISOString(), events: parseTheOddsPrices(await res.json()) };
      } catch { console.warn(JSON.stringify({ event: 'the_odds_prices_failed', status: 'network' })); break; }
    }
    // Events that already kicked off are dropped from the cache (keeps the row small).
    for (const [sport, c] of Object.entries(payload.bySport!)) payload.bySport![sport] = { ...c, events: c.events.filter((x) => Date.parse(x.kickoff) > Date.now() - 3 * 3600_000) };
    if (changed) {
      await query(`INSERT INTO sports_catalog_cache(provider,payload,next_attempt_at) VALUES($1,$2,$3)
        ON CONFLICT(provider) DO UPDATE SET payload=$2`, [PROVIDER, JSON.stringify(payload), new Date()]).catch(() => null);
    }
  }
  return fixtures.map((f) => {
    if (f.status !== 'pre') return f;
    const sport = sportOf.get(f.id);
    const cached = sport ? payload.bySport![sport] : undefined;
    const e = cached?.events.find((x) => sameMatch(f, x));
    return e ? mergeTheOdds(f, e, cached!.at) : f;
  });
}
