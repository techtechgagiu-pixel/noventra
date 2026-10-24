import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { one, query } from '@/lib/db';
import { theOddsCatalog, parseTheOddsMatches } from '@/lib/sports/the-odds-catalog';
import { fixtureCatalog, matchList } from '@/lib/catalog';
import { loadFixtures } from '@/lib/sports/fixtures';
import { localDate } from '@/lib/time';
import { closePool, resetDb } from './helpers';

vi.mock('@/lib/sports/fixtures', () => ({ loadFixtures: vi.fn() }));
const g = globalThis as unknown as { __p11TheOddsRefresh?: Promise<void> | null };
const today = localDate(), sport = { key: 'soccer_epl', title: 'EPL', active: true, has_outrights: false };
const event = { id: 'event1', sport_key: sport.key, home_team: 'Extra Home', away_team: 'Extra Away', commence_time: `${today}T12:00Z` };
const headers = { 'x-requests-used': '0', 'x-requests-remaining': '500', 'x-requests-last': '0' };
const wait = async () => { await g.__p11TheOddsRefresh; };
async function seedCache(age = 7200_000, next = new Date(0)) {
  const payload = { sports: [sport], sportsAt: new Date().toISOString(), byLeague: { [sport.key]: { at: new Date(Date.now() - age).toISOString(), fixtures: parseTheOddsMatches([event], sport, today, 8) } }, creditsUsed: 0, creditsRemaining: 500 };
  await query('INSERT INTO sports_catalog_cache(provider,payload,next_attempt_at) VALUES($1,$2,$3)', ['the-odds-api', JSON.stringify(payload), next]);
  return payload;
}
beforeEach(async () => {
  await resetDb(); vi.stubEnv('ODDS_API_KEY', 'test-odds-key');
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => Response.json(String(url).includes('/sports?') ? [sport] : [event], { headers })));
  vi.mocked(loadFixtures).mockResolvedValue({ fixtures: [], errors: [], leagues: [], days: [today], fetchedAt: new Date().toISOString() });
});
afterEach(async () => { await wait(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); }); afterAll(closePool);

it('does not make calls or read a cache without a key or explicit informational enablement', async () => {
  expect((await theOddsCatalog(today, 8, false)).source.configured).toBe(false);
  vi.stubEnv('ODDS_API_KEY', ''); expect((await theOddsCatalog(today, 8)).fixtures).toEqual([]);
  expect(fetch).not.toHaveBeenCalled(); expect(await one('SELECT * FROM sports_catalog_cache')).toBeNull();
});
it('shares a refresh among concurrent readers, calls only free metadata/events and persists the snapshot', async () => {
  await Promise.all(Array.from({ length: 12 }, () => theOddsCatalog(today, 8))); await wait();
  const result = await theOddsCatalog(today, 8);
  expect(result.source).toMatchObject({ refreshing: false, leaguesLoaded: 1, leaguesTotal: 1, creditsUsed: 0, creditsRemaining: 500, error: null });
  expect(result.fixtures).toHaveLength(1); expect(fetch).toHaveBeenCalledTimes(2);
  expect(vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(['/v4/sports', '/v4/sports/soccer_epl/events']);
  expect(await one('SELECT * FROM fixtures')).toBeNull(); expect(await one('SELECT * FROM agent_predictions')).toBeNull();
});
it('honors another process lease and serves a persistent snapshot without making calls', async () => {
  await seedCache(7200_000, new Date(Date.now() + 300_000));
  expect((await theOddsCatalog(today, 8)).fixtures).toHaveLength(1); await wait(); expect(fetch).not.toHaveBeenCalled();
});
it('preserves previous data and safely backs off when a key is rejected', async () => {
  await seedCache(); vi.mocked(fetch).mockResolvedValue(Response.json({ message: 'secret provider details' }, { status: 401 }));
  await theOddsCatalog(today, 8); await wait(); const result = await theOddsCatalog(today, 8);
  expect(result.fixtures).toHaveLength(1); expect(result.source.error).toContain('refuzat cheia'); expect(result.source.error).not.toContain('secret');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('stops if a supposedly free endpoint reports a credit cost', async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json([sport], { headers: { ...headers, 'x-requests-last': '1', 'x-requests-used': '1', 'x-requests-remaining': '499' } }));
  await theOddsCatalog(today, 8); await wait();
  expect(fetch).toHaveBeenCalledTimes(1); expect((await theOddsCatalog(today, 8)).source).toMatchObject({ creditsUsed: 1, creditsRemaining: 499, error: expect.stringContaining('cost neașteptat') });
});
it('refreshes expired competitions while reusing fresh metadata and skips new network traffic for fresh data', async () => {
  await seedCache(); await theOddsCatalog(today, 8); await wait(); await theOddsCatalog(today, 8);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(new URL(String(vi.mocked(fetch).mock.calls[0][0])).pathname).toBe('/v4/sports/soccer_epl/events');
});
it('excludes the removed API-Football cache and keeps the default and shared fixture catalog isolated', async () => {
  await seedCache(0, new Date(Date.now() + 300_000));
  await query("INSERT INTO sports_catalog_cache(provider,payload) VALUES('api-football',$1)", [JSON.stringify({ [today]: { fixtures: [{ id: 'api-football:removed' }] } })]);
  expect((await matchList('unused')).rows).toEqual([]);
  const list = await matchList('unused', 'all', true);
  expect(list.rows).toHaveLength(1); expect(list.rows[0]).toMatchObject({ source: 'the-odds-api', odds: null, analysis: null });
  expect((await fixtureCatalog()).data!.fixtures).toEqual([]); expect(fetch).not.toHaveBeenCalled();
  expect(await one('SELECT * FROM ticket_generation_jobs')).toBeNull(); expect(await one('SELECT * FROM agent_predictions')).toBeNull();
});
