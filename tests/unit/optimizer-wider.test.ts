import { describe, expect, it } from 'vitest';
import { optimizeTicket, type Candidate } from '@/lib/optimizer';

const fam = ['DC', 'TOTAL', 'TT', 'HTTOT'];
const cands: Candidate[] = Array.from({ length: 14 }, (_, i) => ({ fixtureId: `f${i}`, teams: [`H${i}`, `A${i}`], odds: 1.22, bookmaker: 'B', quality: 0.8, risk: 'LOW', probability: 0.8, family: fam[i % 4] }));

describe('custom ticket with too few legs for its target', () => {
  it('cannot reach 10 with exactly 7 safe legs, but can with more validated matches', () => {
    const exact = optimizeTicket({ candidates: cands, target: 10, requiredLegs: 7, tolerance: 0.15 });
    expect(exact.status).toBe('INCOMPLETE');
    const wider = optimizeTicket({ candidates: cands, target: 10, requiredLegs: null, minLegs: 7, maxLegs: 20, tolerance: 0.15 });
    expect(wider.status).toBe('COMPLETED');
    expect(wider.legs.length).toBeGreaterThan(7);
    expect(Math.abs(Math.log(wider.totalOdds / 10))).toBeLessThanOrEqual(Math.log(1.15));
  });
});
