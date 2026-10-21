import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { config, isProduction } from './config';
import { one, query, tx } from './db';

export const SESSION_COOKIE = 'bm_sid';
export const VISITOR_DAYS = 7;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export type User = { id: string; email: string; name: string | null; picture: string | null; role: 'user' | 'admin'; soundEnabled: boolean; soundVolume: number };
export const hashAccessCode = (code: string) => sha256(code.trim().toUpperCase().replace(/[\s-]/g, ''));
export const newAccessCode = () => `P11-${randomBytes(16).toString('hex').toUpperCase().match(/.{8}/g)!.join('-')}`;
export const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure: isProduction || config.appBaseUrl.startsWith('https://'), path: '/' };
export const authConfigured = () => /^[a-f0-9]{64}$/i.test(config.ownerAccessCodeHash);
type Access = { invitationId?: string; ownerCodeHash?: string; expiresAt?: Date };

/** Old Google sessions and callers without a verified code cannot create production sessions. */
export async function createSession(userId: string, userAgent?: string, access: Access = {}) {
  if (!config.allowDemoProviders && !access.invitationId && !access.ownerCodeHash) throw new Error('Codul de acces este necesar.');
  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Math.min(Date.now() + 14 * 86400_000, access.expiresAt?.getTime() ?? Infinity));
  await query(`INSERT INTO sessions (id,user_id,expires_at,user_agent,invitation_id,owner_code_hash) VALUES ($1,$2,$3,$4,$5,$6)`,
    [sha256(raw), userId, expiresAt, userAgent?.slice(0, 200) ?? null, access.invitationId ?? null, access.ownerCodeHash ?? null]);
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
export async function currentUser(): Promise<User | null> {
  return userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function destroySession(raw: string | undefined) {
  if (raw) await query('DELETE FROM sessions WHERE id=$1', [sha256(raw)]);
}
