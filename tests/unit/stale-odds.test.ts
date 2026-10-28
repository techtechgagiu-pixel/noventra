import { afterEach, expect, it, vi } from 'vitest';
const rows = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@/lib/db', async (orig) => ({ ...await orig<typeof import('@/lib/db')>(),
  one: vi.fn(async (_sql: string, params?: unknown[]) => { const p = rows.get(String(params?.[0])); return p ? { payload: p } : null; }),
  query: vi.fn(async () => ({})), many: vi.fn(async () => []) }));
import { withTheOddsPrices } from '@/lib/sports/the-odds-prices';
import type { Fixture } from '@/lib/sports/types';

const kickoff = new Date(Date.now() + 6 * 3600_000).toISOString();
const espn = { id: 'espn:1', provider: 'espn', providerId: '1', leagueId: 'ROU1', league: 'L', home: 'FCSB', away: 'CFR Cluj', kickoff, status: 'pre',
  odds: { bookmaker: 'DraftKings', source: 'espn', observedAt: new Date().toISOString(), providerUpdatedAt: null, markets: [{ key: '1X2:HOME', label: 'FCSB câștigă (1)', odds: 1.8, marketType: '1X2' }] } } as unknown as Fixture;
const prime = (ageMs: number) => {
  rows.set('the-odds-api', { byLeague: { soccer_romania_liga_1: { fixtures: [{ home: 'FCSB', away: 'CFR Cluj', kickoff }] } } });
  rows.set('the-odds-api-prices', { day: new Date().toISOString().slice(0, 10), bySport: { soccer_romania_liga_1: { at: new Date(Date.now() - ageMs).toISOString(),
    events: [{ id: 'e1', home: 'FCSB', away: 'CFR Cluj', kickoff, books: 7, markets: [{ key: '1X2:HOME', label: 'x', odds: 2.4, marketType: '1X2' }] }] } } });
};
afterEach(() => rows.clear());

it('uses fresh The Odds API prices as the main source', async () => {
  prime(30 * 60_000);
  const [f] = await withTheOddsPrices([espn], { fetchAllowed: false });
  expect(f.odds?.markets.find((m) => m.key === '1X2:HOME')?.odds).toBe(2.4);
});

it('keeps using The Odds API prices for up to 4 days (fetched every 3 days, owner decision)', async () => {
  prime(2 * 86_400_000);
  const [f] = await withTheOddsPrices([espn], { fetchAllowed: false });
  expect(f.odds?.markets.find((m) => m.key === '1X2:HOME')?.odds).toBe(2.4);
});

it('falls back to live ESPN prices once The Odds API prices are older than 4 days', async () => {
  prime(5 * 86_400_000);
  const [f] = await withTheOddsPrices([espn], { fetchAllowed: false });
  expect(f.odds?.markets.find((m) => m.key === '1X2:HOME')?.odds).toBe(1.8);
  expect(f.odds?.source).toBe('espn');
});
