import { NextResponse, type NextRequest } from 'next/server';
import { fail, json, rateLimited, requireUser, sameOrigin } from '@/lib/http';
import { canSeeAccounts } from '@/lib/ticket-removal';
import { pendingStakeResults, ResultError, saveStakeResult } from '@/lib/sports/stake-results';

export const dynamic = 'force-dynamic';

/** Owner only: Stake-only matches that wait for a typed final score. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (!canSeeAccounts(user)) return fail('Doar proprietarul poate introduce rezultate.', 403);
  return json({ pending: await pendingStakeResults() });
}

/** Owner only: { fixtureId, home, away, htHome?, htAway?, cancelled? }. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Cerere respinsă (origine necunoscută).', 403);
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (!canSeeAccounts(user)) return fail('Doar proprietarul poate introduce rezultate.', 403);
  if (rateLimited(`stake-results:${user.id}`, 60, 60_000)) return fail('Prea multe cereri. Așteaptă un minut.', 429);
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return fail('Cerere invalidă.', 400);
  try { return json(await saveStakeResult(body)); }
  catch (error) { if (error instanceof ResultError) return fail(error.message, 422); throw error; }
}
