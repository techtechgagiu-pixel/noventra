import { NextResponse, type NextRequest } from 'next/server';
import { json, requireUser } from '@/lib/http';
import { AGENTS } from '@/lib/ai/agents';
import { activeAssignments } from '@/lib/ai/assignments';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const a = await activeAssignments();
  return json({ agents: AGENTS.map((x) => ({ id: x.id, name: x.name, title: x.title, specialty: x.specialty, risk: x.risk, accent: x.accent, voting: x.id !== 'scout', model: a.get(x.id)?.primary ?? null, fallback: a.get(x.id)?.fallback ?? null, promptVersion: a.get(x.id)?.promptVersion })) });
}
