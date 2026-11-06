import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, json, requireOwner, sameOrigin } from '@/lib/http';
import { cancelJobs } from '@/lib/admin-panel';

export const dynamic = 'force-dynamic';
const Body = z.union([z.object({ jobId: z.string().uuid() }), z.object({ userId: z.string().uuid() })]);
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Origine respinsă.', 403);
  const admin = await requireOwner(req);
  if (admin instanceof NextResponse) return admin;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail('Cerere invalidă.');
  return json({ cancelled: await cancelJobs(body.data) });
}
