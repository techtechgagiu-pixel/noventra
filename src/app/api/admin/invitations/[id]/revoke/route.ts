import { NextResponse, type NextRequest } from 'next/server';
import { atomic, SQL_NOW } from '@/lib/db';
import { fail, isUuid, json, requireAdmin, sameOrigin } from '@/lib/http';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail('Origine respinsă.', 403);
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!isUuid(id)) return fail('Invitație invalidă.', 404);
  await atomic([
    { text: `UPDATE invitation_codes SET revoked_at=COALESCE(revoked_at,${SQL_NOW()}) WHERE id=$1`, params: [id] },
    { text: 'DELETE FROM sessions WHERE invitation_id=$1', params: [id] },
  ]);
  return json({ ok: true });
}
