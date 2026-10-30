import { NextResponse, type NextRequest } from 'next/server';
import { json, fail, requireUser } from '@/lib/http';
import { AGENTS } from '@/lib/ai/agents';
import { agentHistory, currentMonth } from '@/lib/agent-stats';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const { id } = await params;
  if (!AGENTS.some(a => a.id === id)) return fail('Agentul nu a fost găsit.', 404);
  const q = req.nextUrl.searchParams, requested = q.get('month');
  const month = requested === 'all' || /^\d{4}-(0[1-9]|1[0-2])$/.test(requested ?? '') ? requested! : currentMonth();
  const scope = q.get('scope') === 'mine' ? 'mine' : 'all';
  const sport = q.get('sport') === 'cs' ? 'cs' : 'football';
  return json({ entries: await agentHistory(user.id, id, month, scope, sport), month, scope, sport });
}
