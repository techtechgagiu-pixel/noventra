import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, json, requireOwner, sameOrigin } from '@/lib/http';
import { query, SQL_NOW } from '@/lib/db';

export const dynamic = 'force-dynamic';
const Body = z.object({ userId: z.string().uuid(), blocked: z.boolean() });
/** Blocks or unblocks a Google account; admins and owner identities can never be blocked from here. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Origine respinsă.', 403);
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail('Cerere invalidă.');
  if (body.data.userId === owner.id) return fail('Nu îți poți bloca propriul cont.', 400);
  await query(`UPDATE users SET blocked_at=${body.data.blocked ? SQL_NOW() : 'NULL'} WHERE id=$1 AND role<>'admin' AND google_sub NOT LIKE 'invite:%' AND google_sub <> 'owner:primary'`, [body.data.userId]);
  return json({ ok: true });
}
