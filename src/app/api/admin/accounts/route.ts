import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { query, SQL_NOW } from '@/lib/db';
import { accountsList } from '@/lib/accounts';
import { fail, json, requireAdmin, sameOrigin } from '@/lib/http';
import { GUEST_CUSTOM_LIMIT, OWNER_CUSTOM_LIMIT } from '@/lib/slots';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  return json({ accounts: await accountsList() });
}

const Body = z.union([
  z.object({ id: z.string().uuid(), blocked: z.boolean() }),
  // limit: custom tickets per day for this account; null = back to the default.
  z.object({ id: z.string().uuid(), limit: z.number().int().min(0).max(OWNER_CUSTOM_LIMIT).nullable() }),
]);
/** Blocks or unblocks a Google account; a block ends its sessions at once (checked on every request). */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Origine respinsă.', 403);
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail('Cerere invalidă.');
  if ('limit' in body.data) {
    await query(`UPDATE users SET custom_daily_limit=$2 WHERE id=$1 AND google_sub NOT LIKE 'invite:%' AND google_sub <> 'owner:primary'`, [body.data.id, body.data.limit === GUEST_CUSTOM_LIMIT ? null : body.data.limit]);
    return json({ accounts: await accountsList() });
  }
  await query(`UPDATE users SET blocked_at=${body.data.blocked ? SQL_NOW() : 'NULL'} WHERE id=$1 AND google_sub NOT LIKE 'invite:%' AND google_sub <> 'owner:primary'`, [body.data.id]);
  return json({ accounts: await accountsList() });
}
