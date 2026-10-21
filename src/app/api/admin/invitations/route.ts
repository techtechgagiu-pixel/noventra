import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { issueInvitation } from '@/lib/auth';
import { many } from '@/lib/db';
import { fail, json, rateLimited, requireAdmin, sameOrigin } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  return json({ invitations: await many(`SELECT id,label,created_at,expires_at,revoked_at,last_used_at,use_count FROM invitation_codes ORDER BY created_at DESC LIMIT 200`) });
}
const Body = z.object({ count: z.number().int().min(1).max(20).default(1), label: z.string().trim().min(1).max(80).default('Vizitator') });
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Origine respinsă.', 403);
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  if (rateLimited(`issue-invites:${admin.id}`, 10, 60_000)) return fail('Așteaptă un minut înainte de a emite alte coduri.', 429);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail('Alege între 1 și 20 de invitații și un nume de maximum 80 de caractere.');
  const invitations = [];
  for (let i = 0; i < body.data.count; i++) invitations.push(await issueInvitation(admin.id, body.data.count > 1 ? `${body.data.label} ${i + 1}` : body.data.label));
  return json({ invitations }, 201);
}
