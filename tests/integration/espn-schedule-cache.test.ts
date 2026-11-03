import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { query } from '@/lib/db';
import { espnTeamPastEvents } from '@/lib/sports/espn';
import { clearSportsCache } from '@/lib/sports/http';
import { closePool, resetDb } from './helpers';

const sched = { events: [
  { id: '1', date: '2026-10-20T18:00Z', league: { name: 'Champions League' }, competitions: [{ status: { type: { state: 'post' } } }] },
  { id: '2', date: '2026-10-27T18:00Z', league: { name: 'Liga' }, competitions: [{ status: { type: { state: 'post' } } }] },
  { id: '3', date: '2026-12-01T18:00Z', league: { name: 'Liga' }, competitions: [{ status: { type: { state: 'pre' } } }] },
] };
beforeEach(async () => { await resetDb(); clearSportsCache(); vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(sched))); });
afterEach(() => { vi.unstubAllGlobals(); }); afterAll(closePool);

it('asks ESPN for a team schedule once; later calls (even after the in-memory cache is gone) read it from the database', async () => {
  const first = await espnTeamPastEvents('uefa.champions', '493', '2026-11-03T17:45:00Z');
  expect(first.map((e) => e.eventId)).toEqual(['2', '1']);
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  clearSportsCache();
  expect((await espnTeamPastEvents('uefa.champions', '493', '2026-11-03T17:45:00Z')).map((e) => e.eventId)).toEqual(['2', '1']);
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  // a stale row is refreshed
  await query("UPDATE sports_catalog_cache SET payload=jsonb_set(payload,'{at}',to_jsonb($1::text)) WHERE provider='espn-schedule:all:493'", [new Date(Date.now() - 7 * 3600_000).toISOString()]);
  clearSportsCache();
  await espnTeamPastEvents('uefa.champions', '493', '2026-11-03T17:45:00Z');
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
});
