import { NextResponse, type NextRequest } from 'next/server';
import { json, requireUser } from '@/lib/http';
import { listTickets } from '@/lib/views';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  return json({ tickets: await listTickets(user.id) });
}
