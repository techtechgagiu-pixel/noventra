import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { one, query, SQL_NOW } from './db';

/**
 * Private key for the laptop's automatic Stake import (02.11). The owner creates it on /cote and sees it once; the
 * database keeps only its SHA-256. Creating a new key revokes the previous ones. The key can only upload exports.
 */
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const PREFIX = 'p11imp_';

export async function createImportToken(userId: string) {
  const token = PREFIX + randomBytes(24).toString('base64url');
  await query(`UPDATE import_tokens SET revoked_at=${SQL_NOW()} WHERE user_id=$1 AND revoked_at IS NULL`, [userId]);
  await query('INSERT INTO import_tokens(id,user_id,token_hash) VALUES($1,$2,$3)', [randomUUID(), userId, sha256(token)]);
  return token;
}

export async function revokeImportTokens(userId: string) {
  await query(`UPDATE import_tokens SET revoked_at=${SQL_NOW()} WHERE user_id=$1 AND revoked_at IS NULL`, [userId]);
}

/** The owner id of a valid key (Authorization: Bearer p11imp_…), else null. */
export async function importTokenUser(header: string | null): Promise<string | null> {
  const m = /^Bearer\s+(p11imp_[A-Za-z0-9_-]{20,})$/.exec(header ?? '');
  if (!m) return null;
  const row = await one<{ id: string; user_id: string }>('SELECT id,user_id FROM import_tokens WHERE token_hash=$1 AND revoked_at IS NULL', [sha256(m[1])]);
  if (!row) return null;
  await query(`UPDATE import_tokens SET last_used_at=${SQL_NOW()} WHERE id=$1`, [row.id]);
  return row.user_id;
}

export async function importTokenStatus(userId: string) {
  const r = await one<{ created_at: string | Date; last_used_at: string | Date | null }>(
    'SELECT created_at,last_used_at FROM import_tokens WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1', [userId]);
  return r ? { active: true, createdAt: new Date(r.created_at).toISOString(), lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null } : { active: false, createdAt: null, lastUsedAt: null };
}
