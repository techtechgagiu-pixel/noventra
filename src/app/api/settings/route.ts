import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, json, requireUser, sameOrigin } from '@/lib/http';
import { query } from '@/lib/db';

const Body = z.object({ soundEnabled: z.boolean(), soundVolume: z.number().int().min(0).max(100) });
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Origine respinsă.', 403);
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail('Date invalide.');
  await query('UPDATE users SET sound_enabled=$2, sound_volume=$3 WHERE id=$1', [user.id, p.data.soundEnabled, p.data.soundVolume]);
  return json({ ok: true });
}
