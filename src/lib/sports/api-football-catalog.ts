import { one, query } from '../db';
import { dateRange, localDate } from '../time';
import { utcDay } from '../usage';
import type { MatchRow } from '../catalog';

/** Deliberately separate from FixtureProvider: this feed supplies the informational match catalog only. */
export type AdditionalMatch = {
  id: string; leagueId: string; league: string; country: string; home: string; away: string;
  homeLogo: string | null; awayLogo: string | null; kickoff: string;
  status: 'pre' | 'in' | 'post' | 'postponed' | 'cancelled'; score: string | null;
};
type DayCache = { at: string; fixtures: AdditionalMatch[] };
type CacheRow = { payload: Record<string, DayCache>; next_attempt_at: Date; last_error: string | null };
export type AdditionalSourceStatus = {
  configured: boolean; refreshing: boolean; updatedAt: string | null;
  requestsUsed: number; dailyLimit: number; datesLoaded: number; error: string | null;
};
const PROVIDER = 'api-football';
// 48 refreshes for today + 4 for each of seven future days = about 76 requests/day.
// Leave at least 10 requests of the Free plan for account checks and manual tests.
export const API_FOOTBALL_DAILY_LIMIT = 90;
const g = globalThis as unknown as { __p11ApiFootballRefresh?: Promise<void> | null };
const ttl = (day: string, today: string) => day === today ? 30 * 60_000 : 6 * 3600_000;
const record = (x: unknown): Record<string, unknown> => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {};
const str = (x: unknown) => typeof x === 'string' ? x : '';
const id = (x: unknown) => typeof x === 'number' && Number.isSafeInteger(x) && x > 0 ? x : null;
const score = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : null;

export function parseApiFootballMatches(raw: unknown, day: string): AdditionalMatch[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    const r = record(value), f = record(r.fixture), l = record(r.league), teams = record(r.teams);
    const h = record(teams.home), a = record(teams.away), goals = record(r.goals);
    const fixtureId = id(f.id), leagueId = id(l.id), kickoff = str(f.date);
    if (!fixtureId || !leagueId || !str(h.name) || !str(a.name) || !str(l.name) || !Number.isFinite(Date.parse(kickoff)) || localDate(new Date(kickoff)) !== day) return [];
    const state = str(record(f.status).short);
    const status: AdditionalMatch['status'] = ['FT', 'AET', 'PEN'].includes(state) ? 'post'
      : ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE'].includes(state) ? 'in'
        : ['PST', 'SUSP'].includes(state) ? 'postponed'
          : ['CANC', 'ABD', 'AWD', 'WO'].includes(state) ? 'cancelled' : 'pre';
    const hs = score(goals.home), as = score(goals.away);
    return [{
      id: `api-football:${fixtureId}`, leagueId: `api-football:league:${leagueId}`,
      league: str(l.name), country: str(l.country) || 'Internațional',
      home: str(h.name), away: str(a.name), homeLogo: str(h.logo) || null, awayLogo: str(a.logo) || null,
      kickoff: new Date(kickoff).toISOString(), status,
      score: (status === 'in' || status === 'post') && hs !== null && as !== null ? `${hs}–${as}` : null,
    }];
  });
}

/** Conservative name equivalence: preserve women/youth/reserve designations and home/away order. */
const teamName = (name: string) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ø/g, 'o').replace(/ł/g, 'l')
  .replace(/[^a-z0-9]+/g, ' ').split(' ').filter((s) => s && !['fc', 'afc', 'cf', 'sc', 'if', 'fk', 'ac', 'club', 'football', 'futbol'].includes(s)).join(' ');
export function mergeInformationalMatches(existing: MatchRow[], extra: AdditionalMatch[]): MatchRow[] {
  const out = [...existing];
  const ids = new Set(existing.map((m) => m.id));
  const pair = (m: Pick<AdditionalMatch, 'home' | 'away'>) => {
    const home = teamName(m.home), away = teamName(m.away);
    return home && away ? `${home}|${away}` : null;
  };
  const kickoffs = new Map<string, number[]>();
  const remember = (m: Pick<AdditionalMatch, 'home' | 'away' | 'kickoff'>) => {
    const key = pair(m);
    if (key) kickoffs.set(key, [...(kickoffs.get(key) ?? []), Date.parse(m.kickoff)]);
  };
  existing.forEach(remember);
  for (const m of extra) {
    const key = pair(m);
    const duplicate = ids.has(m.id) || (key !== null && (kickoffs.get(key) ?? []).some((at) => Math.abs(at - Date.parse(m.kickoff)) <= 10 * 60_000));
    // Never overwrite ESPN/LPF IDs, prices, confirmed scores or saved analysis annotations.
    if (!duplicate) { out.push({ ...m, source: PROVIDER, odds: null, analysis: null }); ids.add(m.id); remember(m); }
  }
  return out;
}

async function refresh(today: string, days: string[], key: string) {
  // One DB-backed lease across processes. Failed reads keep the previous successful payload.
  const claimed = await one<CacheRow>(
    `INSERT INTO sports_catalog_cache(provider,next_attempt_at) VALUES($1,now()+interval '5 minutes')
     ON CONFLICT(provider) DO UPDATE SET next_attempt_at=now()+interval '5 minutes'
     WHERE sports_catalog_cache.next_attempt_at<=now()
     RETURNING payload,next_attempt_at,last_error`, [PROVIDER]);
  if (!claimed) return;
  const payload: Record<string, DayCache> = Object.fromEntries(Object.entries(claimed.payload).filter(([day]) => days.includes(day)));
  let error: string | null = null;
  let retryAt = Date.now() + 30 * 60_000;
  for (const day of days) {
    const cached = payload[day];
    if (cached && Date.now() - Date.parse(cached.at) < ttl(day, today)) continue;
    const requestDay = utcDay();
    const reservation = await one<{ requests: number }>(
      `INSERT INTO provider_usage(provider,day,requests,tokens,errors) VALUES($1,$2,1,0,0)
       ON CONFLICT(provider,day) DO UPDATE SET requests=provider_usage.requests+1
       WHERE provider_usage.requests<$3 RETURNING requests`, [PROVIDER, requestDay, API_FOOTBALL_DAILY_LIMIT]);
    if (!reservation) { error = 'Bugetul zilnic API-Football este consumat; păstrăm ultimul program disponibil.'; break; }
    try {
      const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${day}&timezone=Europe%2FBucharest`, {
        headers: { 'x-apisports-key': key, Accept: 'application/json' }, signal: AbortSignal.timeout(12_000), cache: 'no-store',
      });
      // Include requests made outside this application in our safety budget when the provider reports them.
      const remaining = response.headers.get('x-ratelimit-requests-remaining');
      if (remaining !== null && /^\d+$/.test(remaining)) {
        await query('UPDATE provider_usage SET requests=GREATEST(requests,$3) WHERE provider=$1 AND day=$2', [PROVIDER, requestDay, Math.max(0, 100 - Number(remaining))]);
      }
      if (!response.ok) throw new Error('source');
      const body = record(await response.json());
      if (Object.keys(record(body.errors)).length || (Array.isArray(body.errors) && body.errors.length) || !Array.isArray(body.response)) throw new Error('source');
      if (Number(record(body.paging).total ?? 1) > 1) throw new Error('pagination');
      payload[day] = { at: new Date().toISOString(), fixtures: parseApiFootballMatches(body.response, day) };
      // Make each completed day visible while the remaining days are still loading.
      await query('UPDATE sports_catalog_cache SET payload=$2 WHERE provider=$1', [PROVIDER, JSON.stringify(payload)]);
    } catch {
      // Do not log response bodies, account details, URLs with credentials or request headers.
      error = 'API-Football nu este disponibil acum. ESPN și LPF rămân active; păstrăm datele anterioare.';
      retryAt = Date.now() + 15 * 60_000;
      await query('UPDATE provider_usage SET errors=errors+1 WHERE provider=$1 AND day=$2', [PROVIDER, requestDay]);
      break;
    }
  }
  if (!error) retryAt = Math.min(...days.map((day) => Date.parse(payload[day].at) + ttl(day, today)));
  else if (error.startsWith('Bugetul')) retryAt = Date.parse(`${utcDay(new Date(Date.now() + 86400_000))}T00:00:01Z`);
  await query('UPDATE sports_catalog_cache SET payload=$2,next_attempt_at=$3,last_error=$4 WHERE provider=$1', [PROVIDER, JSON.stringify(payload), new Date(retryAt), error]);
}

export async function apiFootballCatalog(today: string, count: number, enabled = true) {
  const key = process.env.API_FOOTBALL_KEY;
  const empty = { fixtures: [] as AdditionalMatch[], source: { configured: false, refreshing: false, updatedAt: null, requestsUsed: 0, dailyLimit: API_FOOTBALL_DAILY_LIMIT, datesLoaded: 0, error: null } as AdditionalSourceStatus };
  if (!enabled || !key) return empty;
  const days = dateRange(today, Math.min(8, Math.max(1, count)));
  try {
    const [cached, usage] = await Promise.all([
      one<CacheRow>('SELECT payload,next_attempt_at,last_error FROM sports_catalog_cache WHERE provider=$1', [PROVIDER]),
      one<{ requests: number }>('SELECT requests FROM provider_usage WHERE provider=$1 AND day=$2', [PROVIDER, utcDay()]),
    ]);
    if ((!cached || cached.next_attempt_at.getTime() <= Date.now()) && !g.__p11ApiFootballRefresh) {
      g.__p11ApiFootballRefresh = refresh(today, days, key)
        .catch(() => { console.warn(JSON.stringify({ event: 'api_football_catalog_failed' })); })
        .finally(() => { g.__p11ApiFootballRefresh = null; });
    }
    const snapshots = days.flatMap((day) => cached?.payload[day] ? [cached.payload[day]] : []);
    return {
      fixtures: snapshots.flatMap((d) => d.fixtures),
      source: { configured: true, refreshing: !!g.__p11ApiFootballRefresh,
        updatedAt: snapshots.length ? snapshots.map((d) => d.at).sort()[0] : null,
        requestsUsed: usage?.requests ?? 0, dailyLimit: API_FOOTBALL_DAILY_LIMIT, datesLoaded: snapshots.length, error: cached?.last_error ?? null },
    };
  } catch {
    return { ...empty, source: { ...empty.source, configured: true, error: 'Catalogul API-Football nu poate fi citit acum. ESPN și LPF rămân active.' } };
  }
}
