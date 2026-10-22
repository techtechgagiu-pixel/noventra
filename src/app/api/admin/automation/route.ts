import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin, sameOrigin, json, rateLimited } from '@/lib/http';
import { automationHealth } from '@/lib/automation';
import { settlePending } from '@/lib/settlement';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req);
  if (user instanceof NextResponse) return user;
  return json(await automationHealth());
}
/** Manual non-AI check. It cannot create, resume or change any forecast. */
export async function POST(req: NextRequest) {
  const user = await requireAdmin(req);
  if (user instanceof NextResponse) return user;
  if (!sameOrigin(req)) return json({ error: 'Origine respinsă.' }, 403);
  if (rateLimited(`settlement:${user.id}`, 1, 60_000)) return json({ error: 'O verificare pe minut este suficientă.' }, 429);
  const result = await settlePending();
  return json({ result, health: await automationHealth() });
}
