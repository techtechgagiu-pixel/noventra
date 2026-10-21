import { describe, expect, it } from 'vitest';
import { optimizeTicket, type Candidate } from '@/lib/optimizer';

const c = (id: string, odds: number, q = 0.5, book = 'DK'): Candidate => ({ fixtureId: id, teams: [`${id}h`, `${id}a`], odds, bookmaker: book, quality: q, risk: 'MEDIUM' });

describe('ticket optimizer', () => {
  it('daily target 5 within tolerance, uses actual product of prices', () => {
    const r = optimizeTicket({ candidates: [c('a', 1.5), c('b', 1.8), c('c', 2.0), c('d', 1.3), c('e', 2.6)], target: 5, requiredLegs: null, tolerance: 0.15 });
    expect(r.status).toBe('COMPLETED');
    const prod = r.legs.reduce((p, l) => p * l.odds, 1);
    expect(r.totalOdds).toBeCloseTo(prod, 2);
    expect(Math.abs(Math.log(r.totalOdds / 5))).toBeLessThanOrEqual(Math.log(1.15) + 1e-9);
  });
  it('daily target 10 prefers manageable leg counts', () => {
    const r = optimizeTicket({ candidates: [c('a', 2.1), c('b', 2.2), c('c', 2.3), c('d', 1.2), c('e', 1.25), c('f', 1.3), c('g', 1.35)], target: 10, requiredLegs: null, tolerance: 0.15 });
    expect(r.status).toBe('COMPLETED');
    expect(r.legs.length).toBeLessThanOrEqual(4);
  });
  it('weekly: exactly 12 distinct fixtures around 100', () => {
    const cands = Array.from({ length: 16 }, (_, i) => c(`f${i}`, [1.4, 1.45, 1.5, 1.55, 1.48, 1.52][i % 6]));
    const r = optimizeTicket({ candidates: cands, target: 100, requiredLegs: 12, tolerance: 0.15 });
    expect(r.legs).toHaveLength(12);
    expect(new Set(r.legs.map((l) => l.fixtureId)).size).toBe(12);
    expect(r.status).toBe('COMPLETED');
  });
  it('weekly with fewer than 12 qualified fixtures is incomplete — never fabricated', () => {
    const r = optimizeTicket({ candidates: Array.from({ length: 9 }, (_, i) => c(`f${i}`, 1.6)), target: 100, requiredLegs: 12, tolerance: 0.15 });
    expect(r.status).toBe('INCOMPLETE');
    expect(r.legs).toHaveLength(0);
    expect(r.reason).toMatch(/exact 12/);
  });
  it('unreachable target returns closest combination with actual odds', () => {
    const r = optimizeTicket({ candidates: [c('a', 1.1), c('b', 1.15), c('c', 1.12)], target: 10, requiredLegs: null, tolerance: 0.15 });
    expect(r.status).toBe('INCOMPLETE');
    expect(r.closest!.totalOdds).toBeGreaterThan(1);
  });
  it('flags mixed bookmakers and never repeats a team', () => {
    const r = optimizeTicket({ candidates: [c('a', 2.2, 0.5, 'DK'), c('b', 2.3, 0.5, 'Other')], target: 5, requiredLegs: null, tolerance: 0.15 });
    expect(r.mixedBookmakers).toBe(true);
    const r2 = optimizeTicket({ candidates: [{ ...c('a', 2.2), teams: ['X', 'Y'] }, { ...c('b', 2.3), teams: ['X', 'Z'] }], target: 5, requiredLegs: null, tolerance: 0.15 });
    expect(r2.status).toBe('INCOMPLETE');
  });
});

describe('prudent tickets', () => {
  const c = (id: string, odds: number, p?: number): Candidate => ({ fixtureId: id, teams: [id + 'h', id + 'a'], odds, bookmaker: 'DK', quality: 0.5, risk: 'LOW', probability: p ?? null });
  it('cotă 5 is never 2 big prices: with maxLegOdds 1.65 and minLegs 3 it uses small prices', () => {
    const r = optimizeTicket({ candidates: [c('big1', 2.0, 0.52), c('big2', 2.8, 0.36), c('a', 1.36, 0.7), c('b', 1.45, 0.66), c('d', 1.5, 0.64), c('e', 1.6, 0.6), c('f', 1.3, 0.74)], target: 5, requiredLegs: null, tolerance: 0.15, minLegs: 3, maxLegs: 7, maxLegOdds: 1.65 });
    expect(r.status).toBe('COMPLETED');
    expect(r.legs.length).toBeGreaterThanOrEqual(3);
    expect(r.legs.every((l) => l.odds <= 1.65)).toBe(true);
  });
  it('prefers the combination with the higher chance that every leg wins', () => {
    const r = optimizeTicket({ candidates: [c('x', 1.4, 0.75), c('y', 1.45, 0.6), c('z', 1.42, 0.74)], target: 2, requiredLegs: null, tolerance: 0.15, minLegs: 2, maxLegs: 4, maxLegOdds: 1.45 });
    expect(r.legs.map((l) => l.fixtureId).sort()).toEqual(['x', 'z']);
  });
});

describe('variety rule', () => {
  const c = (id: string, odds: number, family: string): Candidate => ({ fixtureId: id, teams: [id + 'h', id + 'a'], odds, bookmaker: 'DK', quality: 0.5, risk: 'LOW', probability: 0.9 / odds, family });
  it('with 3+ legs, no market type fills more than half of the ticket', () => {
    const r = optimizeTicket({ candidates: [c('a', 1.5, 'DC'), c('b', 1.5, 'DC'), c('d', 1.5, 'DC'), c('e', 1.55, '1X2'), c('f', 1.45, 'TOTAL')], target: 5, requiredLegs: null, tolerance: 0.15, minLegs: 3, maxLegs: 7, maxLegOdds: 1.65 });
    expect(r.status).toBe('COMPLETED');
    const counts = r.legs.reduce<Record<string, number>>((m, l) => ({ ...m, [l.family!]: (m[l.family!] ?? 0) + 1 }), {});
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(Math.ceil(r.legs.length / 2));
  });
  it('all-same-type candidates give an honest INCOMPLETE', () => {
    const r = optimizeTicket({ candidates: [c('a', 1.5, 'DC'), c('b', 1.5, 'DC'), c('d', 1.55, 'DC'), c('e', 1.5, 'DC')], target: 5, requiredLegs: null, tolerance: 0.15, minLegs: 3, maxLegs: 7, maxLegOdds: 1.65 });
    expect(r.status).toBe('INCOMPLETE');
    expect(r.reason).toMatch(/prea asemănătoare/);
  });
});
