import { NextResponse, type NextRequest } from 'next/server';
import { fail, isUuid, json, requireUser } from '@/lib/http';
import { jobEvents, ticketDetail } from '@/lib/views';

export const dynamic = 'force-dynamic';
/** Decision Replay: strictly read-only. Zero AI calls, zero sports-API calls, no job creation. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail('Identificator invalid.', 400);
  const ticket = await ticketDetail(user.id, id);
  if (!ticket) return fail('Biletul nu există.', 404);
  const events = (await jobEvents(user.id, ticket.jobId, 0)) ?? [];
  return json({ mode: 'REPLAY', ticket, events, partial: events.length === 0 || !events.some((e) => e.type === 'TICKET_FINALIZED') });
}
