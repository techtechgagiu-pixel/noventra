import { describe, expect, it } from 'vitest';
import { characterViolation, isBannedMarket } from '@/lib/jobs/analysis';

describe('owner-banned markets', () => {
  it('bans every under line and the double chance 12, keeps the other picks', () => {
    for (const k of ['TOTAL:UNDER:2.5', 'TT:HOME:UNDER:1.5', 'MT:UNDER:2.5', 'DC:12', 'BTTS:NO']) expect(isBannedMarket(k)).toBe(true);
    for (const k of ['DC:1X', 'DC:X2', '1X2:HOME', '1X2:DRAW', 'TOTAL:OVER:2.5', 'BTTS:YES', 'ML:HOME']) expect(isBannedMarket(k)).toBe(false);
  });
  it('a vote for 12 is set aside with a clear reason', () => {
    const why = characterViolation({ decision: 'BET_CANDIDATE', marketKey: 'DC:12' } as never, { name: 'Ilie', maxOdds: 3, minProbability: 0.5 }, { minOdds: 1.1, maxOdds: 3, minProbability: 0.5 }, { odds: 1.3, estimatedProbability: 0.8 });
    expect(why).toContain('12');
  });
});
