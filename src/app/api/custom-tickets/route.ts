import { NextResponse, type NextRequest } from 'next/server';
import { fail, json, rateLimited, requireUser, sameOrigin } from '@/lib/http';
import { SlotError, createCustomJob, customJobs, customBatchJobs } from '@/lib/jobs/service';
import { customLimitFor } from '@/lib/ticket-removal';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const batch = req.nextUrl.searchParams.get('batch');
  if (batch && !/^[0-9a-f-]{36}$/i.test(batch)) return fail('Lot invalid.', 400);
  return json({ jobs: batch ? await customBatchJobs(user.id, batch) : await customJobs(user.id) });
}

/** Queues custom tickets: { target, legs, agents[], fromHours, toHours, leagues[], count?, requestId? }. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Cerere respinsă (origine necunoscută).', 403);
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (rateLimited(`custom:${user.id}`, 6, 60_000)) return fail('Prea multe cereri. Așteaptă un minut.', 429);
  const body = await req.json().catch(() => null);
  try {
    return json(await createCustomJob(user.id, body, new Date(), customLimitFor(user)), 201);
  } catch (error) {
    if (error instanceof SlotError) return fail(error.message, error.status);
    throw error;
  }
}
