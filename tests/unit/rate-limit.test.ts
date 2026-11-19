import { expect, it, vi } from 'vitest';
import { limitExceeded, RATE_LIMITS } from '../../src/lib/rate-limit';
import { safeEqual } from '../../src/lib/safe-equal';

it('fără binding Cloudflare, limita cade pe contorul din memorie', async () => {
  const key = `test-${Math.random()}`;
  for (let i = 0; i < RATE_LIMITS.RL_CHECKOUT.limit; i++) expect(await limitExceeded('RL_CHECKOUT', key)).toBe(false);
  expect(await limitExceeded('RL_CHECKOUT', key)).toBe(true);
  expect(await limitExceeded('RL_CHECKOUT', `${key}-alt`)).toBe(false);
});

it('pe Cloudflare folosește binding-ul, iar dacă acesta pică revine la memorie', async () => {
  vi.resetModules();
  const limit = vi.fn().mockResolvedValueOnce({ success: false }).mockRejectedValueOnce(new Error('down'));
  vi.doMock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ env: { RL_CUSTOM: { limit } } }) }));
  const before = process.env.BETMIND_RUNTIME; process.env.BETMIND_RUNTIME = 'cloudflare-production';
  try {
    const { limitExceeded: viaBinding } = await import('../../src/lib/rate-limit');
    expect(await viaBinding('RL_CUSTOM', 'u1')).toBe(true);
    expect(await viaBinding('RL_CUSTOM', 'u1')).toBe(false);
    expect(limit).toHaveBeenCalledWith({ key: 'RL_CUSTOM:u1' });
  } finally { process.env.BETMIND_RUNTIME = before; vi.doUnmock('@opennextjs/cloudflare'); }
});

it('compară secretele corect', async () => {
  expect(await safeEqual('abc', 'abc')).toBe(true);
  expect(await safeEqual('abc', 'abd')).toBe(false);
  expect(await safeEqual('abc', 'abcd')).toBe(false);
  expect(await safeEqual(null, 'abc')).toBe(false);
});
