import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { accountsList } from '@/lib/accounts';
import { fail, json, requireAdmin, sameOrigin } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  return json({ accounts: await accountsList() });
}

const Body = z.object({ id: z.string().uuid(), blocked: z.boolean() });
/** Blocks or unblocks a Google account; a block ends its sessions at once (checked on every request). */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Origine respinsă.', 403);
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail('Cerere invalidă.');
  await query(`UPDATE users SET blocked_at=${body.data.blocked ? 'now()' : 'NULL'} WHERE id=$1 AND google_sub NOT LIKE 'invite:%' AND google_sub <> 'owner:primary'`, [body.data.id]);
  return json({ accounts: await accountsList() });
}
