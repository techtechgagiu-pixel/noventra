import { NextResponse, type NextRequest } from 'next/server';
import { query, tx } from '@/lib/db';
import { fail, isUuid, json, requireAdmin, sameOrigin } from '@/lib/http';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail('Origine respinsă.', 403);
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail('Invitație invalidă.', 404);
  await tx(async (db) => {
    await query('UPDATE invitation_codes SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1', [id], db);
    await query('DELETE FROM sessions WHERE invitation_id=$1', [id], db);
  });
  return json({ ok: true });
}
