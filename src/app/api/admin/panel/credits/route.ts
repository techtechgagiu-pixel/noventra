import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, json, requireAdmin, sameOrigin } from '@/lib/http';
import { adjustCredits, setFounder } from '@/lib/credits';
import { SlotError } from '@/lib/jobs/errors';

export const dynamic = 'force-dynamic';
const Body = z.union([
  z.object({ userId: z.string().uuid(), delta: z.number().int() }),
  z.object({ userId: z.string().uuid(), founder: z.boolean() }),
]);
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Origine respinsă.', 403);
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail('Cerere invalidă.');
  try {
    if ('delta' in body.data) await adjustCredits(body.data.userId, body.data.delta, admin.id);
    else await setFounder(body.data.userId, body.data.founder);
    return json({ ok: true });
  } catch (e) { return e instanceof SlotError ? fail(e.message, e.status) : fail('Nu am putut salva.', 500); }
}
