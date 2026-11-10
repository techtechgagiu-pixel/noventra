import { describe, expect, it } from 'vitest';
import { customPolicy, type CustomConfig } from '../../src/lib/slots';
import { parseCustom } from '../../src/lib/jobs/service';
import { characterViolation } from '../../src/lib/jobs/analysis';

const cfg = (extra: Partial<CustomConfig> = {}): CustomConfig => ({ target: 1000, legs: 20, agents: ['victor'], window: '7d', ...extra });

describe('custom ticket „riscă și cote mari”', () => {
  it('widens the price band, lowers the probability floor and aims each leg at the price the target needs', () => {
    const normal = customPolicy(cfg()); const bold = customPolicy(cfg({ bold: true }));
    expect(bold.maxOdds).toBeGreaterThan(normal.maxOdds); expect(bold.maxOdds).toBeLessThanOrEqual(6);
    expect(bold.minProbability).toBeLessThan(normal.minProbability); expect(bold.minProbability).toBeGreaterThanOrEqual(0.2);
    expect(bold.pick).toBe('nearest'); expect(bold.aim).toBeCloseTo(Math.pow(1000, 1 / 20), 5); expect(bold.bold).toBe(true); expect(normal.bold).toBeUndefined();
  });
  it('lifts the agents\' own price cap and personal probability floor only when bold', () => {
    const agent = { name: 'Victor', maxOdds: 1.55, minProbability: 0.68 };
    const market = { odds: 2.4, estimatedProbability: 0.45 };
    const p = { decision: 'BET_CANDIDATE', marketKey: 'TOTAL:OVER:2.5', estimatedProbability: 0.45 } as never;
    expect(characterViolation(p, agent, customPolicy(cfg()), market)).toMatch(/depășește limita/);
    expect(characterViolation(p, agent, customPolicy(cfg({ bold: true })), market)).toBeNull();
  });
  it('is read from the request only when exactly true', () => {
    const body = { target: 1000, legs: 20, agents: ['victor'] };
    expect(parseCustom({ ...body, bold: true }).bold).toBe(true);
    expect(parseCustom({ ...body, bold: 'true' }).bold).toBeUndefined();
    expect(parseCustom(body).bold).toBeUndefined();
  });
});
