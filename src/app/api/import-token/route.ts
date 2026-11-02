import { NextResponse, type NextRequest } from 'next/server';
import { fail, json, rateLimited, requireUser, sameOrigin } from '@/lib/http';
import { canSeeAccounts } from '@/lib/ticket-removal';
import { createImportToken, importTokenStatus, revokeImportTokens } from '@/lib/import-token';

export const dynamic = 'force-dynamic';

async function owner(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  return canSeeAccounts(user) ? user : fail('Doar proprietarul poate gestiona cheia de import.', 403);
}

export async function GET(req: NextRequest) {
  const user = await owner(req);
  if (user instanceof NextResponse) return user;
  return json(await importTokenStatus(user.id));
}

/** Creates a new key (shown once) and revokes the previous ones. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Cerere respinsă (origine necunoscută).', 403);
  const user = await owner(req);
  if (user instanceof NextResponse) return user;
  if (rateLimited(`import-token:${user.id}`, 5, 60_000)) return fail('Prea multe cereri. Așteaptă un minut.', 429);
  return json({ token: await createImportToken(user.id), ...(await importTokenStatus(user.id)) }, 201);
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Cerere respinsă (origine necunoscută).', 403);
  const user = await owner(req);
  if (user instanceof NextResponse) return user;
  await revokeImportTokens(user.id);
  return json(await importTokenStatus(user.id));
}
