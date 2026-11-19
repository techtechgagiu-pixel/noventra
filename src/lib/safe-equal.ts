/**
 * 19.11: constant-time string comparison for secrets (Workers and Node). Both values are first reduced to an HMAC with a
 * random one-time key, so the comparison always walks 32 bytes whatever the lengths and contents of the inputs.
 */
export async function safeEqual(a: string | null | undefined, b: string | null | undefined): Promise<boolean> {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const key = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.sign('HMAC', key, enc.encode(a)), crypto.subtle.sign('HMAC', key, enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}
