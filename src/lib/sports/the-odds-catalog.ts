import { one, query, dialect, SQL_NOW, timeCompare } from '../db';
import { dateRange, localDate } from '../time';
import { utcDay } from '../usage';
import type { InformationalMatch } from './informational-matches';

type Sport = { key: string; title: string };
type LeagueCache = { at: string; fixtures: InformationalMatch[] };
type Payload = { sports?: Sport[]; sportsAt?: string; byLeague?: Record<string, LeagueCache>; creditsUsed?: number | null; creditsRemaining?: number | null };
type CacheRow = { payload: Payload; next_attempt_at: Date; last_error: string | null };
export type InformationalSourceStatus = {
  configured: boolean; refreshing: boolean; updatedAt: string | null; leaguesLoaded: number; leaguesTotal: number;
  creditsUsed: number | null; creditsRemaining: number | null; error: string | null;
};
// User decision 26.10: the schedule is read once every 3 days (8-day window), cached in the database.
const PROVIDER = 'the-odds-api', FRESH_MS = 3 * 24 * 3600_000;
const g = globalThis as unknown as { __p11TheOddsRefresh?: Promise<void> | null };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 200) : '';
const soccer = (value: unknown): value is string => typeof value === 'string' && /^soccer_[a-z0-9_]+$/.test(value);

export function parseSoccerLeagues(raw: unknown): Sport[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((value) => {
    const r = object(value);
    if (!soccer(r.key) || r.active !== true || r.has_outrights !== false || !text(r.title) || seen.has(r.key)) return [];
    seen.add(r.key); return [{ key: r.key, title: text(r.title) }];
  }).slice(0, 80);
}
export function parseTheOddsMatches(raw: unknown, sport: Sport, today: string, count: number, now = Date.now()): InformationalMatch[] {
  if (!Array.isArray(raw)) return [];
  const days = new Set(dateRange(today, Math.min(8, Math.max(1, count))));
  const seen = new Set<string>();
  return raw.flatMap((value) => {
    const r = object(value), id = text(r.id), home = text(r.home_team), away = text(r.away_team), kickoff = text(r.commence_time);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || seen.has(id) || r.sport_key !== sport.key || !home || !away || home === away || !Number.isFinite(Date.parse(kickoff)) || !days.has(localDate(new Date(kickoff)))) return [];
    seen.add(id);
    return [{ id: `the-odds-api:${id}`, leagueId: `the-odds-api:league:${sport.key}`, league: sport.title, country: 'Alte competiții',
      home, away, homeLogo: null, awayLogo: null, kickoff: new Date(kickoff).toISOString(),
      // The events endpoint supplies no score or confirmed match status. Do not claim that an old kickoff is LIVE.
      status: Date.parse(kickoff) > now ? 'pre' as const : 'unknown' as const, score: null }];
  });
}
function publicError(status: number) {
  return status === 401 || status === 403 ? 'The Odds API a refuzat cheia de acces. Păstrăm ultimul program disponibil.'
    : status === 429 ? 'The Odds API limitează temporar cererile. Reîncercăm mai târziu.'
      : 'The Odds API nu este disponibil acum. Păstrăm ultimul program disponibil.';
}
async function refresh(today: string, count: number, key: string) {
  const claimed = await one<CacheRow>(`INSERT INTO sports_catalog_cache(provider,next_attempt_at) VALUES($1,${dialect("now()+interval '5 minutes'","strftime('%Y-%m-%dT%H:%M:%fZ','now','+5 minutes')")})
    ON CONFLICT(provider) DO UPDATE SET next_attempt_at=${dialect("now()+interval '5 minutes'","strftime('%Y-%m-%dT%H:%M:%fZ','now','+5 minutes')")} WHERE ${timeCompare('sports_catalog_cache.next_attempt_at','<=',SQL_NOW())}
    RETURNING payload,next_attempt_at,last_error`, [PROVIDER]);
  if (!claimed) return;
  const payload: Payload = { ...claimed.payload, byLeague: { ...claimed.payload.byLeague } };
  const started = Date.now();
  let error: string | null = null;
  const read = async (path: string) => {
    // Strictly schedules and competition metadata. Both endpoints have zero usage-credit cost.
    const url = new URL(`https://api.the-odds-api.com/v4/${path}`); url.searchParams.set('apiKey', key);
    const response = await fetch(url, { signal: AbortSignal.timeout(6000), cache: 'no-store' });
    await query(`INSERT INTO provider_usage(provider,day,requests,tokens,errors) VALUES($1,$2,1,0,0)
      ON CONFLICT(provider,day) DO UPDATE SET requests=provider_usage.requests+1`, [PROVIDER, utcDay()]);
    for (const [header, field] of [['x-requests-used', 'creditsUsed'], ['x-requests-remaining', 'creditsRemaining']] as const) {
      const value = response.headers.get(header);
      if (value !== null && /^\d+$/.test(value)) payload[field] = Number(value);
    }
    const cost = response.headers.get('x-requests-last');
    if (cost !== null && Number(cost) > 0) throw new Error('The Odds API a raportat un cost neașteptat pentru program. Actualizarea a fost oprită pentru a proteja creditele.');
    if (!response.ok) throw new Error(publicError(response.status));
    const result: unknown = await response.json();
    if (!Array.isArray(result)) throw new Error(publicError(500));
    return result;
  };
  try {
    if (!payload.sports || !payload.sportsAt || Date.now() - Date.parse(payload.sportsAt) >= 86400_000) {
      payload.sports = parseSoccerLeagues(await read('sports')); payload.sportsAt = new Date().toISOString();
    }
    for (const [i, sport] of payload.sports.entries()) {
      const cached = payload.byLeague![sport.key];
      if (cached && Date.now() - Date.parse(cached.at) < FRESH_MS) continue;
      if (Date.now() - started > 180_000) throw new Error('Programul suplimentar se încarcă în etape. Păstrăm competițiile deja încărcate.');
      const raw = await read(`sports/${sport.key}/events`);
      payload.byLeague![sport.key] = { at: new Date().toISOString(), fixtures: parseTheOddsMatches(raw, sport, today, count) };
      if (i % 5 === 0) await query('UPDATE sports_catalog_cache SET payload=$2 WHERE provider=$1', [PROVIDER, JSON.stringify(payload)]);
      // At most four calls/second; shared across all readers through the database lease.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const active = new Set(payload.sports.map((s) => s.key));
    payload.byLeague = Object.fromEntries(Object.entries(payload.byLeague!).filter(([league]) => active.has(league)));
  } catch (e) {
    // Only our fixed messages are exposed. Never log provider bodies, fetch errors or credential-bearing URLs.
    const message = (e as Error).message;
    error = message.startsWith('The Odds API ') || message.startsWith('Programul suplimentar ') ? message : publicError(500);
    await query('UPDATE provider_usage SET errors=errors+1 WHERE provider=$1 AND day=$2', [PROVIDER, utcDay()]);
  }
  const next = error ? Date.now() + 15 * 60_000 : Math.min(Date.now() + FRESH_MS, ...Object.values(payload.byLeague!).map((d) => Date.parse(d.at) + FRESH_MS));
  await query('UPDATE sports_catalog_cache SET payload=$2,next_attempt_at=$3,last_error=$4 WHERE provider=$1', [PROVIDER, JSON.stringify(payload), new Date(next), error]);
}
export async function theOddsCatalog(today: string, count: number, enabled = true) {
  const empty = { fixtures: [] as InformationalMatch[], source: { configured: false, refreshing: false, updatedAt: null, leaguesLoaded: 0, leaguesTotal: 0, creditsUsed: null, creditsRemaining: null, error: null } as InformationalSourceStatus };
  const key = process.env.ODDS_API_KEY?.trim();
  const cloudflare=process.env.BETMIND_RUNTIME?.startsWith('cloudflare');
  if (!enabled || (!key&&!cloudflare)) return empty;
  try {
    const cached = await one<CacheRow>('SELECT payload,next_attempt_at,last_error FROM sports_catalog_cache WHERE provider=$1', [PROVIDER]);
    if (!cloudflare && key && (!cached || cached.next_attempt_at.getTime() <= Date.now()) && !g.__p11TheOddsRefresh) {
      g.__p11TheOddsRefresh = refresh(today, count, key).catch(() => console.warn(JSON.stringify({ event: 'the_odds_catalog_failed' }))).finally(() => { g.__p11TheOddsRefresh = null; });
    }
    const sports = cached?.payload.sports ?? [], snapshots = sports.flatMap((s) => cached?.payload.byLeague?.[s.key] ? [cached.payload.byLeague[s.key]] : []);
    const days = new Set(dateRange(today, Math.min(8, Math.max(1, count))));
    return { fixtures: snapshots.flatMap((d) => d.fixtures).filter((f) => days.has(localDate(new Date(f.kickoff)))).map((f) => ({ ...f, status: Date.parse(f.kickoff) > Date.now() ? 'pre' as const : 'unknown' as const })),
      source: { configured: true, refreshing: !!g.__p11TheOddsRefresh, updatedAt: snapshots.length ? snapshots.map((d) => d.at).sort()[0] : null,
        leaguesLoaded: snapshots.length, leaguesTotal: sports.length, creditsUsed: cached?.payload.creditsUsed ?? null, creditsRemaining: cached?.payload.creditsRemaining ?? null, error: cached?.last_error ?? null } };
  } catch { return { ...empty, source: { ...empty.source, configured: true, error: 'Catalogul The Odds API nu poate fi citit acum. ESPN și LPF rămân disponibile.' } }; }
}
