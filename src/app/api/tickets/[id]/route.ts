import { NextResponse, type NextRequest } from 'next/server';
import { fail, isUuid, json, requireUser, sameOrigin } from '@/lib/http';
import { one, query, SQL_NOW } from '@/lib/db';
import { canRemoveTickets } from '@/lib/ticket-removal';
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

/** "Șterge din listă": hides the ticket from Bilete create for everyone. Only the accounts in TICKET_REMOVE_EMAILS may do it.
 * Nothing is deleted: selections and agent predictions stay saved, so statistics do not change. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail('Origine respinsă.', 403);
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail('Identificator invalid.', 400);
  if (!canRemoveTickets(user)) return fail('Ștergerea biletelor nu este disponibilă pentru acest cont.', 403);
  const t = await one<{ user_id: string; status: string | null }>('SELECT t.user_id, j.status FROM tickets t JOIN ticket_generation_jobs j ON j.id=t.job_id WHERE t.id=$1', [id]);
  if (!t) return fail('Biletul nu există.', 404);
  if (t.status && ['QUEUED', 'RUNNING', 'WAITING'].includes(t.status)) return fail('Biletul se finalizează acum; îl poți șterge după ce se oprește analiza.', 409);
  await query(`UPDATE tickets SET hidden_at=${SQL_NOW()}, hidden_by=$2 WHERE id=$1 AND hidden_at IS NULL`, [id, user.id]);
  return json({ ok: true });
}
