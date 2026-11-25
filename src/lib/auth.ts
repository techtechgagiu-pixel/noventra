import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { config, isProduction } from './config';
import { one, query, SQL_NOW, timeCompare } from './db';

export const SESSION_COOKIE = 'bm_sid';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export type User = { id: string; email: string; name: string | null; picture: string | null; role: 'user' | 'admin'; soundEnabled: boolean; soundVolume: number;
  /** Daily custom-ticket limit set for this account by the owner; null = the default. */
  customDailyLimit?: number | null };
export const hashAccessCode = (code: string) => sha256(code.trim().toUpperCase().replace(/[\s-]/g, ''));
export const newAccessCode = () => `P11-${randomBytes(16).toString('hex').toUpperCase().match(/.{8}/g)!.join('-')}`;
export const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure: isProduction || config.appBaseUrl.startsWith('https://'), path: '/' };
export const authConfigured = () => /^[a-f0-9]{64}$/i.test(config.ownerAccessCodeHash);

/** Only a verified owner code opens a session. */
export async function createSession(userId: string, userAgent?: string, ownerCodeHash = config.ownerAccessCodeHash) {
  if (!ownerCodeHash) throw new Error('Codul de acces este necesar.');
  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 14 * 86400_000);
  await query(`INSERT INTO sessions (id,user_id,expires_at,user_agent,owner_code_hash) VALUES ($1,$2,$3,$4,$5)`,
    [sha256(raw), userId, expiresAt, userAgent?.slice(0, 200) ?? null, ownerCodeHash]);
  return { token: raw, maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) };
}

/** Expiration and owner-code rotation take effect on every request. */
export async function userFromToken(raw: string | undefined): Promise<User | null> {
  if (!raw || raw.length > 100 || !authConfigured()) return null;
  const r = await one<{ id: string; email: string; name: string | null; picture: string | null; sound_enabled: boolean; sound_volume: number; custom_daily_limit: number | null }>(
    `SELECT u.id,u.email,u.name,u.picture,u.custom_daily_limit,u.sound_enabled,u.sound_volume
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.id=$1 AND ${timeCompare('s.expires_at','>',SQL_NOW())} AND s.owner_code_hash=$2`,
    [sha256(raw), config.ownerAccessCodeHash]);
  return r ? { id: r.id, email: r.email, name: r.name, picture: r.picture, role: 'admin', soundEnabled: r.sound_enabled, soundVolume: r.sound_volume, customDailyLimit: r.custom_daily_limit ?? null } : null;
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
  if (!timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(config.ownerAccessCodeHash, 'hex'))) return null;
  const owner = await ownerUser();
  return createSession(owner.id, userAgent);
}

export const loginDestination = (intent: unknown) => intent === 'custom' ? '/?tab=custom' : '/';

export async function currentUser(): Promise<User | null> {
  return userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function destroySession(raw: string | undefined) {
  if (raw) await query('DELETE FROM sessions WHERE id=$1', [sha256(raw)]);
}
