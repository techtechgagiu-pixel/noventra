import { NextResponse, type NextRequest } from 'next/server';
import { json, requireUser } from '@/lib/http';
import { getAccount } from '@/lib/credits';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const a = await getAccount(user.id);
  return json({ ...a, enabled: config.creditsEnabled });
}
