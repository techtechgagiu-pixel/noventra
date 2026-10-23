import { NextResponse, type NextRequest } from 'next/server';
import { json, requireUser } from '@/lib/http';
import { listTickets } from '@/lib/views';
import { ticketPerformance } from '@/lib/ticket-performance';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const user = await requireUser(req); if (user instanceof NextResponse) return user;
  const scope = req.nextUrl.searchParams.get('scope') === 'mine' ? 'mine' : 'all';
  const all = await listTickets(user.id);
  return json({ ...ticketPerformance((scope === 'mine' ? all.filter((t) => t.creator.mine) : all) as unknown as Parameters<typeof ticketPerformance>[0]), scope });
}
