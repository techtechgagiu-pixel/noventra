import { NextResponse, type NextRequest } from 'next/server';
import { fail, json, rateLimited, requireUser, sameOrigin } from '@/lib/http';
import { canSeeAccounts } from '@/lib/ticket-removal';
import { ImportError, importStakeExport, importStakeLive, importStatus } from '@/lib/sports/imported-prices';
import { importTokenUser } from '@/lib/import-token';
import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 30 * 1024 * 1024;

/** Owner only: status of the imported odds. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (!canSeeAccounts(user)) return fail('Doar proprietarul poate vedea importul de cote.', 403);
  return json(await importStatus());
}

/**
 * Owner only: uploads the JSON exported on the laptop by stake-sports-api (scripts/export_matches.py). From the browser
 * (session + same origin) or, since 02.11, from the laptop's automatic import (Authorization: Bearer <import key>).
 * An export made with `--state live` only updates the scores of Stake-only matches.
 */
export async function POST(req: NextRequest) {
  const keyUser = await importTokenUser(req.headers.get('authorization'));
  let who: string;
  if (keyUser) {
    const owner = await one<{ id: string; role: string; email: string | null }>('SELECT id, role, email FROM users WHERE id=$1', [keyUser]);
    if (!owner) return fail('Cheie de import invalidă.', 401);
    who = owner.id;
  } else {
    if (req.headers.get('authorization')) return fail('Cheie de import invalidă sau revocată.', 401);
    if (!sameOrigin(req)) return fail('Cerere respinsă (origine necunoscută).', 403);
    const user = await requireUser(req);
    if (user instanceof NextResponse) return user;
    if (!canSeeAccounts(user)) return fail('Doar proprietarul poate importa cote.', 403);
    who = user.id;
  }
  if (rateLimited(`odds-import:${who}`, 12, 60_000)) return fail('Prea multe importuri. Așteaptă un minut.', 429);
  const text = await req.text();
  if (!text) return fail('Fișierul este gol.', 400);
  if (text.length > MAX_BYTES) return fail('Fișierul este prea mare (maximum 30 MB).', 413);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return fail('Fișierul nu este un JSON valid.', 400); }
  try {
    const state = String(((raw as { meta?: { state?: unknown } })?.meta?.state) ?? '');
    if (state === 'live') return json(await importStakeLive(raw), 201);
    return json(await importStakeExport(raw), 201);
  } catch (error) {
    if (error instanceof ImportError) return fail(error.message, 422);
    throw error;
  }
}
