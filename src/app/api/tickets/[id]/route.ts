import { NextResponse, type NextRequest } from 'next/server';
import { fail, isUuid, json, requireUser } from '@/lib/http';
import { ticketDetail } from '@/lib/views';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail('Identificator invalid.', 400);
  const t = await ticketDetail(user.id, id);
  return t ? json(t) : fail('Biletul nu există.', 404);
}
