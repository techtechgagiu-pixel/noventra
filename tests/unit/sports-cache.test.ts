import { afterEach, expect, it, vi } from 'vitest';
import { clearSportsCache, sportsGet } from '@/lib/sports/http';
vi.mock('@/lib/usage', () => ({ providerUsageToday: vi.fn(async () => ({ requests: 0 })), recordProviderUsage: vi.fn(async () => {}) }));
afterEach(() => { clearSportsCache(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('honours a results reader requesting five-minute freshness after a longer catalog cache', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T10:00:00Z'));
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('{"state":"in"}')).mockResolvedValueOnce(new Response('{"state":"post"}'));
  vi.stubGlobal('fetch', fetcher);
  expect(await sportsGet('https://example.com/score', { provider: 'demo', ttlMs: 3600_000 })).toEqual({ state: 'in' });
  vi.setSystemTime(new Date('2026-10-22T10:06:00Z'));
  expect(await sportsGet('https://example.com/score', { provider: 'demo', ttlMs: 300_000 })).toEqual({ state: 'post' });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
