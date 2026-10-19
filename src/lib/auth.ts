import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { config, isProduction } from './config';
import { one, query } from './db';

export const SESSION_COOKIE = 'bm_sid';
export const OAUTH_COOKIE = 'bm_oauth';
const SESSION_DAYS = 14;

export type User = { id: string; email: string; name: string | null; picture: string | null; role: 'user' | 'admin'; soundEnabled: boolean; soundVolume: number };

const b64url = (b: Buffer) => b.toString('base64url');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function sign(payload: object) {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const mac = b64url(createHmac('sha256', config.authSecret).update(body).digest());
  return `${body}.${mac}`;
}
export function verify<T>(token: string | undefined): T | null {
  if (!token || !config.authSecret) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', config.authSecret).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { exp?: number };
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

export const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure: isProduction || config.appBaseUrl.startsWith('https://'), path: '/' };

export function googleAuthUrl() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const nonce = b64url(randomBytes(16));
  const state = b64url(randomBytes(16));
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.googleClientId, redirect_uri: `${config.appBaseUrl}/auth/callback`, response_type: 'code',
    scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  }).toString();
  return { url: url.toString(), cookie: sign({ verifier, state, nonce, exp: Date.now() + 10 * 60_000 }) };
}

type IdClaims = { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string; nonce?: string; aud?: string; iss?: string; exp?: number };

/** Exchanges the code; the ID token comes straight from Google's token endpoint over TLS. */
export async function completeGoogleLogin(code: string, state: string, oauthCookie: string | undefined) {
  const saved = verify<{ verifier: string; state: string; nonce: string }>(oauthCookie);
  if (!saved || saved.state !== state) throw new Error('Starea autentificării nu este validă. Încearcă din nou.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: config.googleClientId, client_secret: config.googleClientSecret, redirect_uri: `${config.appBaseUrl}/auth/callback`, grant_type: 'authorization_code', code_verifier: saved.verifier }),
    signal: AbortSignal.timeout(15_000),
  });
  const token = (await res.json()) as { id_token?: string; error?: string };
  if (!res.ok || !token.id_token) throw new Error(`Google a refuzat autentificarea (${token.error ?? res.status}).`);
  const claims = JSON.parse(Buffer.from(token.id_token.split('.')[1], 'base64url').toString()) as IdClaims;
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss ?? '') || claims.aud !== config.googleClientId || (claims.exp ?? 0) * 1000 < Date.now() || claims.nonce !== saved.nonce) throw new Error('Tokenul Google nu este valid.');
  if (!claims.sub || !claims.email || claims.email_verified !== true) throw new Error('Contul Google nu are un e-mail verificat.');
  const role = config.adminEmails.includes(claims.email.toLowerCase()) ? 'admin' : 'user';
  const user = await one<{ id: string }>(
    `INSERT INTO users (google_sub, email, name, picture, role, last_login_at) VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (google_sub) DO UPDATE SET email=EXCLUDED.email, name=EXCLUDED.name, picture=EXCLUDED.picture, last_login_at=now(),
       role=CASE WHEN EXCLUDED.role='admin' THEN 'admin' ELSE users.role END
     RETURNING id`,
    [claims.sub, claims.email, claims.name ?? null, claims.picture ?? null, role],
  );
  return createSession(user!.id);
}

export async function createSession(userId: string, userAgent?: string) {
  const raw = b64url(randomBytes(32));
  await query('INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES ($1,$2,now() + interval \'14 days\',$3)', [sha256(raw), userId, userAgent?.slice(0, 200) ?? null]);
  await query('DELETE FROM sessions WHERE expires_at < now()');
  return { token: raw, maxAge: SESSION_DAYS * 86400 };
}

export async function userFromToken(raw: string | undefined): Promise<User | null> {
  if (!raw) return null;
  const r = await one<{ id: string; email: string; name: string | null; picture: string | null; role: 'user' | 'admin'; sound_enabled: boolean; sound_volume: number }>(
    'SELECT u.id, u.email, u.name, u.picture, u.role, u.sound_enabled, u.sound_volume FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at > now()',
    [sha256(raw)],
  );
  return r ? { id: r.id, email: r.email, name: r.name, picture: r.picture, role: r.role, soundEnabled: r.sound_enabled, soundVolume: r.sound_volume } : null;
}

export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  return userFromToken(store.get(SESSION_COOKIE)?.value);
}

export async function destroySession(raw: string | undefined) {
  if (raw) await query('DELETE FROM sessions WHERE id=$1', [sha256(raw)]);
}

export const authConfigured = () => !!(config.googleClientId && config.googleClientSecret && config.authSecret);
