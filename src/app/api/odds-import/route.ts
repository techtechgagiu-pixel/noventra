import { NextResponse, type NextRequest } from 'next/server';
import { fail, json, rateLimited, requireUser, sameOrigin } from '@/lib/http';
import { canSeeAccounts } from '@/lib/ticket-removal';
import { ImportError, importStakeExport, importStatus } from '@/lib/sports/imported-prices';

export const dynamic = 'force-dynamic';
const MAX_BYTES = 30 * 1024 * 1024;

/** Owner only: status of the imported odds. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (!canSeeAccounts(user)) return fail('Doar proprietarul poate vedea importul de cote.', 403);
  return json(await importStatus());
}

/** Owner only: uploads the JSON exported on the laptop by stake-sports-api (scripts/export_matches.py). */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Cerere respinsă (origine necunoscută).', 403);
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (!canSeeAccounts(user)) return fail('Doar proprietarul poate importa cote.', 403);
  if (rateLimited(`odds-import:${user.id}`, 6, 60_000)) return fail('Prea multe importuri. Așteaptă un minut.', 429);
  const text = await req.text();
  if (!text) return fail('Fișierul este gol.', 400);
  if (text.length > MAX_BYTES) return fail('Fișierul este prea mare (maximum 30 MB).', 413);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return fail('Fișierul nu este un JSON valid.', 400); }
  try {
    return json(await importStakeExport(raw), 201);
  } catch (error) {
    if (error instanceof ImportError) return fail(error.message, 422);
    throw error;
  }
}
