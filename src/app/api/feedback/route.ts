import { NextResponse, type NextRequest } from 'next/server';
import { many, query } from '@/lib/db';
import { fail, json, rateLimited, requireAdmin, requireUser, sameOrigin } from '@/lib/http';

const KINDS = new Set(['idee', 'problemă', 'altceva']);

/** "Ajută-ne să îmbunătățim": any signed-in user can send an idea or a problem (rate limited). */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Origine respinsă.', 403);
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (rateLimited(`feedback:${user.id}`, 5, 10 * 60_000)) return fail('Ai trimis deja câteva mesaje. Încearcă din nou peste câteva minute.', 429);
  const body = await req.json().catch(() => null) as { kind?: unknown; message?: unknown; page?: unknown } | null;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (message.length < 5) return fail('Scrie câteva cuvinte despre ce ai vrea.');
  if (message.length > 2000) return fail('Mesajul e prea lung (maxim 2000 de caractere).');
  const kind = typeof body?.kind === 'string' && KINDS.has(body.kind) ? body.kind : 'idee';
  const page = typeof body?.page === 'string' ? body.page.slice(0, 200) : null;
  await query('INSERT INTO feedback(user_id, author, kind, message, page) VALUES ($1,$2,$3,$4,$5)', [user.id, user.name ?? user.email, kind, message, page]);
  return json({ ok: true });
}

/** Admins read the suggestions. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const rows = await many('SELECT id, author, kind, message, page, status, created_at FROM feedback ORDER BY created_at DESC LIMIT 200');
  return json({ feedback: rows });
}
