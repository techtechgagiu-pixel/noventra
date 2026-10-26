import { NextResponse, type NextRequest } from 'next/server';
import { fail, json, rateLimited, requireUser } from '@/lib/http';
import { matchMarkets } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

/** Every market (all lines) for one match in the Meciuri tab — read from stored prices, never a new API call. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (rateLimited(`match-markets:${user.id}`, 120, 60_000)) return fail('Prea multe cereri.', 429);
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!/^[a-zA-Z0-9:_.-]{1,140}$/.test(id)) return fail('Meci invalid.');
  return json(await matchMarkets(id));
}
