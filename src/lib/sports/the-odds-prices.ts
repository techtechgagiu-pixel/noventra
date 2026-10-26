import { one, query } from '../db';
import type { Fixture, MarketQuote } from './types';
import type { InformationalMatch } from './informational-matches';

/**
 * Real prices from The Odds API for fixtures whose usual source (ESPN/LPF) publishes none — e.g. SuperLiga or
 * smaller leagues. Only featured markets are requested (1X2 and goal totals), at the median price across the
 * bookmakers the API lists. Nothing is derived: no double chance computed from 1X2, no missing line filled in.
 *
 * Credits are scarce (free plan: 500/month; each competition costs 2 per refresh), so:
 * - only competitions that actually contain fixtures without prices are requested,
 * - every competition is cached for 6 hours (shared by every job through the database),
 * - a daily allowance = remaining credits ÷ days left in the month, never below a 40-credit reserve.
 */
const PROVIDER = 'the-odds-api-prices';
const CATALOG = 'the-odds-api';
const FRESH_MS = 6 * 3600_000;
const COST = 2;
const RESERVE = 40;

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

/** Adds The Odds API prices to fixtures that have none. Returns the same array (new objects for enriched rows). */
export async function withTheOddsPrices(fixtures: Fixture[], opts: { fetchAllowed?: boolean } = {}): Promise<Fixture[]> {
  const missing = fixtures.filter((f) => f.status === 'pre' && (!f.odds || !f.odds.markets.some((m) => m.marketType === '1X2')));
  if (!missing.length) return fixtures;
  const catalog = await one<{ payload: { byLeague?: Record<string, { fixtures: InformationalMatch[] }>; creditsRemaining?: number | null } }>('SELECT payload FROM sports_catalog_cache WHERE provider=$1', [CATALOG]).catch(() => null);
  const byLeague = catalog?.payload.byLeague ?? {};
  // Which competitions hold the fixtures that need prices (from the free schedule already cached).
  const needed = new Map<string, number>();
  const sportOf = new Map<string, string>();
  for (const f of missing) {
    for (const [sport, d] of Object.entries(byLeague)) {
      if (d.fixtures.some((e) => sameMatch(f, e))) { sportOf.set(f.id, sport); needed.set(sport, (needed.get(sport) ?? 0) + 1); break; }
    }
  }
  if (!needed.size) return fixtures;
  const row = await one<{ payload: Payload }>('SELECT payload FROM sports_catalog_cache WHERE provider=$1', [PROVIDER]).catch(() => null);
  const payload: Payload = { bySport: {}, ...(row?.payload ?? {}) };
  payload.bySport = { ...payload.bySport };
  if (payload.day !== utcDay()) { payload.day = utcDay(); payload.usedToday = 0; }
  const key = process.env.ODDS_API_KEY?.trim();
  let changed = false;
  if (key && opts.fetchAllowed !== false) {
    const remaining = payload.creditsRemaining ?? catalog?.payload.creditsRemaining ?? 500;
    const allowance = Math.max(0, Math.floor((remaining - RESERVE) / daysLeftInMonth()));
    const stale = [...needed].filter(([sport]) => { const c = payload.bySport![sport]; return !c || Date.now() - Date.parse(c.at) >= FRESH_MS; }).sort((a, b) => b[1] - a[1]);
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
    if (changed) {
      await query(`INSERT INTO sports_catalog_cache(provider,payload,next_attempt_at) VALUES($1,$2,$3)
        ON CONFLICT(provider) DO UPDATE SET payload=$2`, [PROVIDER, JSON.stringify(payload), new Date()]).catch(() => null);
    }
  }
  return fixtures.map((f) => {
    const sport = sportOf.get(f.id);
    const cached = sport ? payload.bySport![sport] : undefined;
    const e = cached?.events.find((x) => sameMatch(f, x));
    if (!e) return f;
    // Labels use the fixture's own team names, so the rest of the app sees one consistent match.
    const markets = e.markets.map((m) => ({ ...m, label: m.key === '1X2:HOME' ? `${f.home} câștigă (1)` : m.key === '1X2:AWAY' ? `${f.away} câștigă (2)` : m.label }));
    const kept = (f.odds?.markets ?? []).filter((m) => !markets.some((x) => x.key === m.key));
    return { ...f, odds: { bookmaker: `The Odds API · mediana a ${e.books} case`, source: 'the-odds-api', observedAt: cached!.at, providerUpdatedAt: cached!.at, markets: [...markets, ...kept] } };
  });
}
