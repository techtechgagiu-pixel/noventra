import { NextResponse, type NextRequest } from 'next/server';
import { fail, isUuid, json, requireUser, sameOrigin } from '@/lib/http';
import { SlotError, resumeJob } from '@/lib/jobs/service';

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail('Cerere respinsă (origine necunoscută).', 403);
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail('Identificator invalid.', 400);
  try { return json(await resumeJob(user.id, id)); } catch (e) { if (e instanceof SlotError) return fail(e.message, e.status); throw e; }
}
