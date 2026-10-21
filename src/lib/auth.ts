import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { config, isProduction } from './config';
import { one, query, tx } from './db';

export const SESSION_COOKIE = 'bm_sid';
export const OAUTH_COOKIE = 'bm_oauth';
export const VISITOR_DAYS = 7;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export type User = { id: string; email: string; name: string | null; picture: string | null; role: 'user' | 'admin'; soundEnabled: boolean; soundVolume: number };
export const hashAccessCode = (code: string) => sha256(code.trim().toUpperCase().replace(/[\s-]/g, ''));
export const newAccessCode = () => `P11-${randomBytes(16).toString('hex').toUpperCase().match(/.{8}/g)!.join('-')}`;
export const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure: isProduction || config.appBaseUrl.startsWith('https://'), path: '/' };
export const authConfigured = () => /^[a-f0-9]{64}$/i.test(config.ownerAccessCodeHash);
type Access = { invitationId?: string; ownerCodeHash?: string; expiresAt?: Date; google?: boolean };

/** A production session needs a verified code or a verified Google sign-in. */
export async function createSession(userId: string, userAgent?: string, access: Access = {}) {
  if (!config.allowDemoProviders && !access.invitationId && !access.ownerCodeHash && !access.google) throw new Error('Codul de acces este necesar.');
  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Math.min(Date.now() + 14 * 86400_000, access.expiresAt?.getTime() ?? Infinity));
  await query(`INSERT INTO sessions (id,user_id,expires_at,user_agent,invitation_id,owner_code_hash,google_login) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [sha256(raw), userId, expiresAt, userAgent?.slice(0, 200) ?? null, access.invitationId ?? null, access.ownerCodeHash ?? null, !!access.google]);
  return { token: raw, maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) };
}

/** Expiration, revocation and administrator-code rotation take effect on every request. */
export async function userFromToken(raw: string | undefined): Promise<User | null> {
  if (!raw || raw.length > 100) return null;
  const r = await one<{ id: string; email: string; name: string | null; picture: string | null; role: 'user' | 'admin'; sound_enabled: boolean; sound_volume: number }>(
    `SELECT u.id,u.email,u.name,u.picture,
       CASE WHEN s.owner_code_hash=$2 AND $2<>'' THEN 'admin' WHEN $3 THEN u.role ELSE 'user' END AS role,
       u.sound_enabled,u.sound_volume
     FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN invitation_codes i ON i.id=s.invitation_id
     WHERE s.id=$1 AND s.expires_at>now() AND (
       (s.owner_code_hash=$2 AND $2<>'') OR
       (i.id IS NOT NULL AND i.user_id=s.user_id AND i.revoked_at IS NULL AND i.expires_at>now()) OR
       (s.google_login AND u.blocked_at IS NULL) OR
       ($3 AND s.invitation_id IS NULL AND s.owner_code_hash IS NULL))`,
    [sha256(raw), config.ownerAccessCodeHash, config.allowDemoProviders]);
  return r ? { id: r.id, email: r.email, name: r.name, picture: r.picture, role: r.role, soundEnabled: r.sound_enabled, soundVolume: r.sound_volume } : null;
}

/** Reuses the existing owner's identity and archive, only after verifying the permanent code. */
async function ownerUser() {
  const email = (process.env.OWNER_EMAIL || config.adminEmails[0] || 'owner@primul11.local').toLowerCase();
  const row = await one<{ id: string }>('SELECT id FROM users WHERE lower(email)=$1 ORDER BY created_at LIMIT 1', [email]);
  if (row) return row;
  return (await one<{ id: string }>(`INSERT INTO users(google_sub,email,name,role) VALUES ('owner:primary',$1,'Administrator','admin')
    ON CONFLICT(google_sub) DO UPDATE SET role='admin' RETURNING id`, [email]))!;
}

export async function loginWithCode(code: string, userAgent?: string) {
  if (code.length < 20 || code.length > 100 || !authConfigured()) return null;
  const hash = hashAccessCode(code);
  if (timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(config.ownerAccessCodeHash, 'hex'))) {
    const owner = await ownerUser();
    return createSession(owner.id, userAgent, { ownerCodeHash: config.ownerAccessCodeHash });
  }
  const invite = await one<{ id: string; user_id: string; expires_at: Date }>(
    `UPDATE invitation_codes SET last_used_at=now(),use_count=use_count+1
     WHERE code_hash=$1 AND revoked_at IS NULL AND expires_at>now() RETURNING id,user_id,expires_at`, [hash]);
  return invite ? createSession(invite.user_id, userAgent, { invitationId: invite.id, expiresAt: invite.expires_at }) : null;
}

export async function issueInvitation(adminId: string, label: string) {
  const code = newAccessCode();
  return tx(async (db) => {
    const key = randomBytes(16).toString('hex');
    // Internal identities isolate visitor archives; visitors never register or supply an email.
    const u = await one<{ id: string }>(`INSERT INTO users(google_sub,email,name,role) VALUES ($1,$2,$3,'user') RETURNING id`,
      [`invite:${key}`, `${key}@visitor.primul11.local`, label], db);
    const invite = await one<{ id: string; expires_at: Date }>(
      `INSERT INTO invitation_codes(code_hash,label,user_id,created_by,expires_at) VALUES ($1,$2,$3,$4,now()+interval '168 hours') RETURNING id,expires_at`,
      [hashAccessCode(code), label, u!.id, adminId], db);
    return { id: invite!.id, code, label, expiresAt: invite!.expires_at.toISOString() };
  });
}
// ── Google sign-in (OpenID Connect, code flow with PKCE). Always an ordinary account: administration needs the code. ──
const b64url = (b: Buffer) => b.toString('base64url');
function sign(payload: object) {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${b64url(createHmac('sha256', config.authSecret).update(body).digest())}`;
}
function verifySigned<T>(token: string | undefined): T | null {
  if (!token || !config.authSecret) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', config.authSecret).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try { const d = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { exp?: number }; return d.exp && d.exp > Date.now() ? d : null; } catch { return null; }
}
export const googleConfigured = () => !!(config.googleClientId && config.googleClientSecret && config.authSecret);
const redirectUri = () => config.googleRedirectUri || `${config.appBaseUrl}/auth/callback`;

export function googleAuthUrl() {
  const verifier = b64url(randomBytes(32));
  const nonce = b64url(randomBytes(16));
  const state = b64url(randomBytes(16));
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.googleClientId, redirect_uri: redirectUri(), response_type: 'code', scope: 'openid email profile', state, nonce,
    code_challenge: b64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', prompt: 'select_account',
  }).toString();
  return { url: url.toString(), cookie: sign({ verifier, state, nonce, exp: Date.now() + 10 * 60_000 }) };
}

type IdClaims = { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string; nonce?: string; aud?: string; iss?: string; exp?: number };
/** Exchanges the code; the ID token comes straight from Google's token endpoint over TLS, then its claims are checked. */
export async function completeGoogleLogin(code: string, state: string, oauthCookie: string | undefined, userAgent?: string) {
  const saved = verifySigned<{ verifier: string; state: string; nonce: string }>(oauthCookie);
  if (!saved || saved.state !== state) throw new Error('Starea autentificării nu este validă.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: config.googleClientId, client_secret: config.googleClientSecret, redirect_uri: redirectUri(), grant_type: 'authorization_code', code_verifier: saved.verifier }),
    signal: AbortSignal.timeout(15_000),
  });
  const token = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!res.ok || !token.id_token) throw new Error(`Google a refuzat autentificarea (${token.error ?? res.status}).`);
  const claims = JSON.parse(Buffer.from(token.id_token.split('.')[1] ?? '', 'base64url').toString() || '{}') as IdClaims;
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss ?? '') || claims.aud !== config.googleClientId || (claims.exp ?? 0) * 1000 < Date.now() || claims.nonce !== saved.nonce) throw new Error('Tokenul Google nu este valid.');
  if (!claims.sub || !claims.email || claims.email_verified !== true) throw new Error('Contul Google nu are un e-mail verificat.');
  const user = await one<{ id: string; blocked_at: Date | null }>(
    `INSERT INTO users (google_sub, email, name, picture, role, last_login_at) VALUES ($1,$2,$3,$4,'user',now())
     ON CONFLICT (google_sub) DO UPDATE SET email=EXCLUDED.email, name=EXCLUDED.name, picture=EXCLUDED.picture, last_login_at=now()
     RETURNING id, blocked_at`,
    [claims.sub, claims.email.toLowerCase(), claims.name?.slice(0, 120) ?? null, claims.picture?.slice(0, 500) ?? null],
  );
  if (user!.blocked_at) throw new Error('blocked');
  return createSession(user!.id, userAgent, { google: true });
}

export async function currentUser(): Promise<User | null> {
  return userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function destroySession(raw: string | undefined) {
  if (raw) await query('DELETE FROM sessions WHERE id=$1', [sha256(raw)]);
}
