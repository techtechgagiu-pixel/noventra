const COOKIE = 'bm_migration';
const WINDOW = 3600;
const page = '<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Primul 11</title><body style="background:#080e20;color:#e5edf9;font:18px system-ui;max-width:600px;margin:15vh auto;padding:24px"><h1>PRIMUL 11 se mută</h1><p>Transferăm ultimele date. Biletele și statisticile sunt păstrate. Revino în câteva minute.</p></body></html>';

async function mac(secret: string, expiry: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('primul11-migration:' + expiry));
  return [...new Uint8Array(signed)].map(n => n.toString(16).padStart(2, '0')).join('');
}

/** Temporary cutover access only. It never grants an application session or administrator rights. */
export async function maintenanceGate(request: Request, enabled: boolean, secret?: string, now = Date.now()): Promise<Response | null> {
  if (!enabled || new URL(request.url).pathname === '/_internal/database') return null;
  const url = new URL(request.url);
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (secret && request.headers.get('x-p11-maintenance') === secret) return null;
  const value = (request.headers.get('cookie') ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) ?? '';
  const [expiry, signature] = value.split('.');
  const seconds = Math.floor(now / 1000);
  if (secret && /^\d+$/.test(expiry ?? '') && Number(expiry) > seconds && Number(expiry) <= seconds + WINDOW && signature === await mac(secret, expiry)) return null;
  if (secret && url.pathname === '/_migration/unlock') {
    if (request.method === 'GET') return new Response('<!doctype html><html lang="ro"><meta charset="utf-8"><title>Verificare migrare</title><form method="post"><label>Cheie verificare <input name="code" type="password" autocomplete="off" required></label><button>Deschide verificarea</button></form></html>', { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
    if (request.method === 'POST' && request.headers.get('origin') === url.origin) {
      const form = await request.formData().catch(() => null);
      if (form?.get('code') === secret) {
        const expires = String(seconds + WINDOW);
        return new Response(null, { status: 303, headers: { ...headers, Location: '/', 'Set-Cookie': `${COOKIE}=${expires}.${await mac(secret, expires)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${WINDOW}` } });
      }
      return new Response('Cheie invalidă.', { status: 403, headers });
    }
  }
  return new Response(page, { status: 503, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '60' } });
}
