import { NextResponse, type NextRequest } from 'next/server';
import { fail, json, rateLimited, requireUser, sameOrigin } from '@/lib/http';
import { SlotError, createReviewJob, reviewJobs } from '@/lib/jobs/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  return json({ jobs: await reviewJobs(user.id) });
}

/** "Vino cu biletul tău": { legs: [{ fixtureId, marketKey }], advice?: string }. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Cerere respinsă (origine necunoscută).', 403);
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (rateLimited(`review:${user.id}`, 6, 60_000)) return fail('Prea multe cereri. Așteaptă un minut.', 429);
  const body = await req.json().catch(() => null);
  try {
    return json(await createReviewJob(user.id, body), 201);
  } catch (error) {
    if (error instanceof SlotError) return fail(error.message, error.status);
    throw error;
  }
}
