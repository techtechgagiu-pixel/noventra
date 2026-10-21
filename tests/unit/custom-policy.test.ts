import { describe, expect, it } from 'vitest';
import { customPolicy, isCustomSlot, slotInfo } from '@/lib/slots';

describe('custom policy', () => {
  it('derives the price band from the price each leg needs', () => {
    const p = customPolicy({ target: 5, legs: 4, agents: ['alex'], window: '48h' });
    const perLeg = Math.pow(5, 1 / 4);
    expect(p.minLegs).toBe(4); expect(p.maxLegs).toBe(4);
    expect(p.minOdds).toBeLessThan(perLeg); expect(p.maxOdds).toBeGreaterThan(perLeg);
    expect(p.minLeadHours).toBe(2); expect(p.maxAheadHours).toBe(48);
    const big = customPolicy({ target: 100, legs: 6, agents: ['alex'], window: '7d' });
    expect(big.pick).toBe('highest'); expect(big.maxAheadHours).toBe(168);
    expect(big.minProbability).toBeLessThan(p.minProbability);
  });
  it('names custom and retired slots', () => {
    expect(isCustomSlot('CUSTOM_3')).toBe(true); expect(isCustomSlot('FIVE_A')).toBe(false);
    expect(slotInfo('CUSTOM_3', 7, 3).title).toBe('CUSTOM — COTĂ 7');
    expect(slotInfo('TEN_A', 10).title).toContain('COTĂ 10');
    expect(slotInfo('FIVE_A', 5).id).toBe('FIVE_A');
  });
});

describe('custom interval', () => {
  it('uses the exact interval chosen by the user', async () => {
    const p = customPolicy({ target: 3, legs: 2, agents: ['alex'], window: '48h', fromHours: 0.5, toHours: 30 });
    expect(p.minLeadHours).toBe(0.5); expect(p.maxAheadHours).toBe(30);
    const { parseCustom } = await import('@/lib/jobs/service');
    const c = parseCustom({ target: 3, legs: 2, agents: ['alex'], fromHours: 0.1, toHours: 500 });
    expect(c.fromHours).toBe(0.5); expect(c.toHours).toBe(168);
    const d = parseCustom({ target: 3, legs: 2, agents: ['alex'], fromHours: 10, toHours: 5 });
    expect(d.toHours).toBe(11);
  });
});
