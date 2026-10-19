import { NextResponse, type NextRequest } from 'next/server';
import { fail, json, rateLimited, requireUser, sameOrigin } from '@/lib/http';
import { SlotError, createOrGetJob } from '@/lib/jobs/service';

export const dynamic = 'force-dynamic';
/** The ONLY entry point that authorises AI work. Idempotent per user/slot/period. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slot: string }> }) {
  if (!sameOrigin(req)) return fail('Cerere respinsă (origine necunoscută).', 403);
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (rateLimited(`gen:${user.id}`, 10, 60_000)) return fail('Prea multe cereri. Așteaptă un minut.', 429);
  const { slot } = await ctx.params;
  try {
    const r = await createOrGetJob(user.id, slot);
    return json(r, r.created ? 201 : 200);
  } catch (error) {
    if (error instanceof SlotError) return fail(error.message, error.status);
    throw error;
  }
}
