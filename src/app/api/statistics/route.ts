import { NextResponse, type NextRequest } from 'next/server';
import { json, requireUser } from '@/lib/http';
import { agentStats, currentMonth } from '@/lib/agent-stats';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const user = await requireUser(req); if (user instanceof NextResponse) return user;
  const q = req.nextUrl.searchParams, m = q.get('month');
  const month = m === 'all' || /^\d{4}-(0[1-9]|1[0-2])$/.test(m ?? '') ? m! : currentMonth();
  const scope = q.get('scope') === 'mine' ? 'mine' : 'all';
  const sport = q.get('sport') === 'cs' ? 'cs' : 'football';
  return json({ ...await agentStats(user.id, user.role === 'admin', month, scope, sport), scope });
}
