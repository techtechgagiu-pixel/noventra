import { describe, expect, it } from 'vitest';
import { bestLegs, legChance, pct, ratioFor, ticketChance, type CalibrationBand } from '@/lib/real-chance';

// Measured 18.11 on 1 737 settled legs.
const bands: CalibrationBand[] = [
  { lo: 1, hi: 1.2, n: 269, won: 228, implied: 0.872 },
  { lo: 1.2, hi: 1.35, n: 652, won: 496, implied: 0.79 },
  { lo: 1.35, hi: 1.5, n: 460, won: 299, implied: 0.708 },
  { lo: 1.5, hi: 1.8, n: 315, won: 174, implied: 0.633 },
  { lo: 1.8, hi: 100, n: 41, won: 15, implied: 0.498 },
];

describe('șansa reală', () => {
  it('uses the measured hit rate of the price band, shrunk toward the price when the band is small', () => {
    expect(ratioFor(1.25, bands)).toBeGreaterThan(0.95); // 76.1% won vs 79% implied → ~0.96
    expect(ratioFor(1.25, bands)).toBeLessThan(0.98);
    expect(ratioFor(2.0, bands)).toBeGreaterThan(0.73); // only 41 legs: pulled toward 0.95
    expect(ratioFor(2.0, bands)).toBeLessThan(0.85);
    expect(ratioFor(1.4, [])).toBe(0.95);
  });
  it('multiplies the legs and never exceeds 99% a leg', () => {
    expect(legChance(1.01, bands)).toBeLessThanOrEqual(0.99);
    const one = legChance(1.3, bands);
    expect(ticketChance([1.3, 1.3, 1.3], bands)).toBeCloseTo(one ** 3, 10);
    expect(ticketChance([], bands)).toBe(0);
  });
  it('finds the leg count with the best chance for a target, inside 1.10–3.20 a leg', () => {
    const b = bestLegs(2, bands)!;
    expect(b.perLeg).toBeGreaterThanOrEqual(1.1);
    expect(b.chance).toBeGreaterThan(0.3);
    for (let n = 1; n <= 7; n++) { const per = Math.pow(2, 1 / n); if (per >= 1.1) expect(b.chance).toBeGreaterThanOrEqual(Math.pow(legChance(per, bands), n) - 1e-12); }
  });
  it('formats small chances honestly', () => {
    expect(pct(0.0004)).toBe('<0,1%');
    expect(pct(0.034)).toBe('~3,4%');
    expect(pct(0.42)).toBe('~42%');
    expect(pct(0)).toBe('—');
  });
});
