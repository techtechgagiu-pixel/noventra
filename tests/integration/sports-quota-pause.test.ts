import { afterAll, beforeEach, expect, it } from 'vitest';
import { query } from '@/lib/db';
import { assertSportsQuota, QuotaExceededError } from '@/lib/sports/http';
import { config } from '@/lib/config';
import { closePool, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(closePool);

it('stops analysis preparation when the daily ESPN cap is used up instead of feeding agents empty data', async () => {
  await expect(assertSportsQuota('espn')).resolves.toBeUndefined();
  const day = new Date().toISOString().slice(0, 10);
  await query('INSERT INTO provider_usage (provider, day, requests, tokens, errors) VALUES ($1,$2,$3,0,0)', ['espn', day, config.limits.sportsDailyRequests]);
  await expect(assertSportsQuota('espn')).rejects.toBeInstanceOf(QuotaExceededError);
  await expect(assertSportsQuota('gnews')).resolves.toBeUndefined();
});
