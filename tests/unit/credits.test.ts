import { describe, expect, it } from 'vitest';
import { creditsForLegs, extraCents, parseExtra, EXTRA_MAX, PLANS } from '../../src/lib/credits';
import { boostedAgree, missedTarget } from '../../src/lib/ticket-completion';
import { verifySignature } from '../../src/lib/stripe-signature';
import { createHmac } from 'node:crypto';

describe('credite', () => {
  it('un credit acoperă 6 meciuri', () => {
    expect([1, 6, 7, 12, 13, 18, 20].map(creditsForLegs)).toEqual([1, 1, 2, 2, 3, 3, 4]);
  });
  it('planurile cresc în credite și scad ca preț pe credit', () => {
    const per = PLANS.map((p) => p.priceCents / p.credits);
    expect(per[0]).toBeGreaterThan(per[1]); expect(per[1]).toBeGreaterThan(per[2]);
    expect(per[0]).toBeLessThan(60);
  });
});

describe('credite extra', () => {
  it('acceptă doar numere întregi în interval și costă 0,60 € per credit', () => {
    expect([1, 5, EXTRA_MAX, '7'].map(parseExtra)).toEqual([1, 5, EXTRA_MAX, 7]);
    expect([0, -2, 1.5, EXTRA_MAX + 1, 'x', null, undefined].map(parseExtra)).toEqual([null, null, null, null, null, null, null]);
    expect(extraCents(5)).toBe(300);
  });
});

describe('semnătura Stripe', () => {
  const secret = 'whsec_test'; const body = '{"a":1}'; const now = 1_800_000_000_000; const t = now / 1000;
  const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  it('acceptă semnătura corectă și respinge cea greșită sau veche', async () => {
    expect(await verifySignature(body, `t=${t},v1=${sig}`, secret, now)).toBe(true);
    expect(await verifySignature(body + ' ', `t=${t},v1=${sig}`, secret, now)).toBe(false);
    expect(await verifySignature(body, `t=${t},v1=${sig}`, secret, now + 600_000)).toBe(false);
    expect(await verifySignature(body, null, secret, now)).toBe(false);
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
