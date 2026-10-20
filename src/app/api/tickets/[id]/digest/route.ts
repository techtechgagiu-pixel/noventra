import { NextResponse, type NextRequest } from 'next/server';
import { fail, isUuid, json, requireUser, sameOrigin } from '@/lib/http';
import { one } from '@/lib/db';
import { buildDigest } from '@/lib/digest';

export const dynamic = 'force-dynamic';
/** Explicit click only ("GENEREAZĂ REZUMATUL") for tickets created before digests existed. Never regenerates. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return fail('Cerere respinsă (origine necunoscută).', 403);
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail('Identificator invalid.', 400);
  const t = await one<{ job_id: string; summary: { digest?: unknown } }>('SELECT job_id, summary FROM tickets WHERE id=$1 AND user_id=$2', [id, user.id]);
  if (!t) return fail('Biletul nu există.', 404);
  if (t.summary.digest) return json({ digest: t.summary.digest });
  const digest = await buildDigest(id, t.job_id);
  return digest ? json({ digest }) : fail('Biletul nu are selecții de rezumat.', 400);
}
