import { NextResponse, type NextRequest } from 'next/server';
import { json, rateLimited, requireUser } from '@/lib/http';
import { matchList } from '@/lib/catalog';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Every available fixture (next 8 days) with odds and this user's analysis status. Never triggers AI. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (rateLimited(`matches:${user.id}`, 30, 60_000)) return json({ error: 'Prea multe cereri.' }, 429);
  return json(await matchList(user.id));
}
