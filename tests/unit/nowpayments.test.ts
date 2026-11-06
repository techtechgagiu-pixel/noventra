import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { makeOrderId, parseOrderId, verifyIpn } from '@/lib/nowpayments';

const sign = (body: object, secret: string) => {
  const sort = (v: any): any => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v;
  return createHmac('sha512', secret).update(JSON.stringify(sort(body))).digest('hex');
};
describe('nowpayments', () => {
  const body = { payment_status: 'finished', order_id: 'x', price_amount: 5.49, nested: { b: 1, a: 2 } };
  it('accepts a valid signature regardless of key order', async () => {
    expect(await verifyIpn(JSON.stringify(body), sign(body, 's3'), 's3')).toBe(true);
  });
  it('rejects wrong secret, missing header, bad json', async () => {
    expect(await verifyIpn(JSON.stringify(body), sign(body, 'other'), 's3')).toBe(false);
    expect(await verifyIpn(JSON.stringify(body), null, 's3')).toBe(false);
    expect(await verifyIpn('nope', 'abc', 's3')).toBe(false);
    expect(await verifyIpn(JSON.stringify(body), sign(body, 's3'), '')).toBe(false);
  });
  it('round-trips the order id', () => {
    const uid = '123e4567-e89b-12d3-a456-426614174000';
    expect(parseOrderId(makeOrderId(uid, 'titular', 40))).toEqual({ userId: uid, plan: 'titular', credits: 40 });
    expect(parseOrderId('garbage')).toBeNull();
  });
});
