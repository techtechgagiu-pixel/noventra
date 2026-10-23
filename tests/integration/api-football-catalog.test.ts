import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { one, query } from '@/lib/db';
import { apiFootballCatalog, parseApiFootballMatches } from '@/lib/sports/api-football-catalog';
import { fixtureCatalog, matchList } from '@/lib/catalog';
import { loadFixtures } from '@/lib/sports/fixtures';
import { dateRange, localDate } from '@/lib/time';
import { utcDay } from '@/lib/usage';
import { closePool, resetDb } from './helpers';

vi.mock('@/lib/sports/fixtures', () => ({ loadFixtures: vi.fn() }));
const g = globalThis as unknown as { __p11ApiFootballRefresh?: Promise<void> | null };
const today = localDate();
const raw = (day = today) => ({ fixture: { id: 123, date: `${day}T12:00:00Z`, status: { short: 'FT' } },
  league: { id: 42, name: 'Extra league' }, teams: { home: { name: 'Extra Home' }, away: { name: 'Extra Away' } }, goals: { home: 2, away: 1 } });
const response = (day = today) => Response.json({ response: [raw(day)], errors: [], paging: { total: 1 } });
const wait = async () => { await g.__p11ApiFootballRefresh; };
async function seedCache(age = 60 * 60_000, next = new Date(0)) {
  const payload = { [today]: { at: new Date(Date.now() - age).toISOString(), fixtures: parseApiFootballMatches([raw()], today) } };
  await query('INSERT INTO sports_catalog_cache(provider,payload,next_attempt_at) VALUES($1,$2,$3)', ['api-football', JSON.stringify(payload), next]);
  return payload;
}
beforeEach(async () => {
  await resetDb();
  vi.stubEnv('API_FOOTBALL_KEY', 'test-api-football-key');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
  vi.mocked(loadFixtures).mockResolvedValue({ fixtures: [], errors: [], leagues: [], days: [today], fetchedAt: new Date().toISOString() });
});
afterEach(async () => { await wait(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
afterAll(closePool);

it('does nothing without a configured key or when the informational feed is disabled', async () => {
  expect((await apiFootballCatalog(today, 8, false)).source.configured).toBe(false);
  vi.stubEnv('API_FOOTBALL_KEY', '');
  expect((await apiFootballCatalog(today, 8)).fixtures).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
  expect(await one('SELECT * FROM sports_catalog_cache')).toBeNull();
});
it('shares one persistent refresh across concurrent readers and reuses the cache', async () => {
  await Promise.all(Array.from({ length: 15 }, () => apiFootballCatalog(today, 1)));
  await wait();
  const result = await apiFootballCatalog(today, 1);
  expect(result.fixtures).toHaveLength(1);
  expect(result.source).toMatchObject({ datesLoaded: 1, requestsUsed: 1, refreshing: false, error: null });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await one('SELECT * FROM fixtures')).toBeNull();
  expect(await one('SELECT * FROM ticket_generation_jobs')).toBeNull();
  expect(await one('SELECT * FROM agent_predictions')).toBeNull();
});
it('honors a database lease owned by another process', async () => {
  await seedCache(3600_000, new Date(Date.now() + 300_000));
  expect((await apiFootballCatalog(today, 1)).fixtures).toHaveLength(1);
  await wait();
  expect(fetch).not.toHaveBeenCalled();
});
it('keeps stale results on provider failure and backs off before retrying', async () => {
  const old = await seedCache();
  vi.mocked(fetch).mockResolvedValue(Response.json({ errors: { token: 'private provider details' } }));
  expect((await apiFootballCatalog(today, 1)).fixtures).toHaveLength(1);
  await wait();
  const result = await apiFootballCatalog(today, 1);
  expect(result.source.error).toContain('nu este disponibil');
  expect(result.source.error).not.toContain('private');
  expect((await one<{ payload: unknown }>('SELECT payload FROM sports_catalog_cache'))!.payload).toEqual(old);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await one('SELECT requests,errors FROM provider_usage')).toMatchObject({ requests: 1, errors: 1 });
});
it('stops at the persisted daily budget even after a process restart', async () => {
  await query('INSERT INTO provider_usage(provider,day,requests) VALUES($1,$2,90)', ['api-football', utcDay()]);
  await apiFootballCatalog(today, 8); await wait();
  expect(fetch).not.toHaveBeenCalled();
  expect((await apiFootballCatalog(today, 8)).source.error).toContain('Bugetul zilnic');
});
it('accounts for requests made outside the app and stops before fetching more days', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ response: [raw()], errors: [] }), { headers: { 'x-ratelimit-requests-remaining': '9' } }));
  await apiFootballCatalog(today, 8); await wait();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((await apiFootballCatalog(today, 8)).source).toMatchObject({ requestsUsed: 91, datesLoaded: 1 });
});
it('refreshes today after 30 minutes while retaining fresh future days for six hours', async () => {
  const days = dateRange(today, 3), at = new Date(Date.now() - 3600_000).toISOString();
  const payload = Object.fromEntries(days.map((day) => [day, { at, fixtures: parseApiFootballMatches([raw(day)], day) }]));
  await query('INSERT INTO sports_catalog_cache(provider,payload,next_attempt_at) VALUES($1,$2,$3)', ['api-football', JSON.stringify(payload), new Date(0)]);
  await apiFootballCatalog(today, 3); await wait();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((await apiFootballCatalog(today, 3)).source.datesLoaded).toBe(3);
});
it('includes extra fixtures only on explicit informational reads, without modifying the shared catalog', async () => {
  await seedCache(0, new Date(Date.now() + 300_000));
  expect((await matchList('unused')).rows).toEqual([]);
  const list = await matchList('unused', 'all', true);
  expect(list.rows).toHaveLength(1);
  expect(list.rows[0]).toMatchObject({ source: 'api-football', odds: null, analysis: null });
  expect(list.leagues).toEqual([expect.objectContaining({ id: 'api-football:league:42', count: 1 })]);
  expect((await fixtureCatalog()).data!.fixtures).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
  expect(await one('SELECT * FROM fixtures')).toBeNull();
  expect(await one('SELECT * FROM agent_predictions')).toBeNull();
});
