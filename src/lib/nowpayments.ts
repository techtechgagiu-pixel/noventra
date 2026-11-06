const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Recursively sorts object keys, as NOWPayments does before signing the IPN body. */
const sortKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, sortKeys(x)])) : v;

/** HMAC-SHA512 of the key-sorted JSON body with the IPN secret, compared with the x-nowpayments-sig header. */
export async function verifyIpn(raw: string, header: string | null, secret: string) {
  if (!header || !secret) return false;
  let body: unknown; try { body = JSON.parse(raw); } catch { return false; }
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, enc.encode(JSON.stringify(sortKeys(body)))));
  const got = header.toLowerCase();
  return got.length === expected.length && [...got].reduce((d, c, i) => d | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0;
}

/** order_id = "userId.plan.credits.nonce": the credits are re-derived from our own tables at the webhook, never trusted from here. */
export const makeOrderId = (userId: string, plan: string, credits: number) => `${userId}.${plan}.${credits}.${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
export function parseOrderId(id: unknown) {
  const m = /^([0-9a-f-]{36})\.([a-z]+)\.(\d{1,3})\.([0-9a-f]{12})$/i.exec(String(id ?? ''));
  return m ? { userId: m[1], plan: m[2], credits: Number(m[3]) } : null;
}
