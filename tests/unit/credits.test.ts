import { describe, expect, it } from 'vitest';
import { creditsForLegs, extraCents, paidSessionCredits, parseExtra, EXTRA_MAX, PLANS } from '../../src/lib/credits';
import { boostedAgree, missedTarget } from '../../src/lib/ticket-completion';

describe('credite', () => {
  it('un credit acoperă un meci', () => {
    expect([1, 6, 7, 12, 13, 18, 20].map(creditsForLegs)).toEqual([1, 6, 7, 12, 13, 18, 20]);
  });
  it('planurile cresc în credite și scad ca preț pe credit', () => {
    const per = PLANS.map((p) => p.priceCents / p.credits);
    expect(per[0]).toBeGreaterThan(per[1]); expect(per[1]).toBeGreaterThan(per[2]);
    expect(per[0]).toBeLessThan(10);
  });
});

describe('credite extra', () => {
  it('acceptă doar numere întregi în interval și costă 0,10 € per credit', () => {
    expect([10, 50, EXTRA_MAX, '70'].map(parseExtra)).toEqual([10, 50, EXTRA_MAX, 70]);
    expect([0, 9, -2, 1.5, EXTRA_MAX + 1, 'x', null, undefined].map(parseExtra)).toEqual([null, null, null, null, null, null, null, null]);
    expect(extraCents(30)).toBe(300);
  });
});

describe('completează biletul', () => {
  it('recunoaște un bilet care a ratat ținta', () => {
    expect(missedTarget(1.82, 10)).toBe(true);
    expect(missedTarget(9.0, 10)).toBe(false);
    expect(missedTarget(null, 10)).toBe(false);
  });
  it('cere 4 agenți de acord, mereu sub efectivul echipei', () => {
    expect([boostedAgree(5, 5), boostedAgree(6, 6), boostedAgree(4, 4), boostedAgree(3, 3), boostedAgree(5, 3), boostedAgree(2, 2)]).toEqual([4, 4, 3, 2, 3, 2]);
  });
});

describe('plata Stripe', () => {
  const titular = PLANS.find((p) => p.id === 'titular')!;
  it('un plan plătit cu suma corectă adaugă creditele planului', () => {
    expect(paidSessionCredits({ currency: 'eur', amount_total: titular.priceCents, metadata: { plan: 'titular' } })).toBe(titular.credits);
  });
  it('un plan plătit cu o sumă greșită sau în altă monedă nu adaugă credite', () => {
    expect(paidSessionCredits({ currency: 'eur', amount_total: 1, metadata: { plan: 'titular' } })).toBeNull();
    expect(paidSessionCredits({ currency: 'eur', metadata: { plan: 'titular' } })).toBeNull();
    expect(paidSessionCredits({ currency: 'usd', amount_total: titular.priceCents, metadata: { plan: 'titular' } })).toBeNull();
    expect(paidSessionCredits({ currency: 'eur', amount_total: titular.priceCents, metadata: { plan: 'inexistent' } })).toBeNull();
  });
  it('creditele extra cer suma exactă la prețul unui credit', () => {
    expect(paidSessionCredits({ currency: 'eur', amount_total: extraCents(30), metadata: { plan: 'extra', credits: '30' } })).toBe(30);
    expect(paidSessionCredits({ currency: 'eur', amount_total: extraCents(10), metadata: { plan: 'extra', credits: '30' } })).toBeNull();
  });
});
