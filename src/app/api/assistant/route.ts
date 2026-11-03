import { NextResponse, type NextRequest } from 'next/server';
import { fail, json, rateLimited, requireUser, sameOrigin } from '@/lib/http';
import { canSeeAccounts } from '@/lib/ticket-removal';
import { askAssistant, type ChatMessage } from '@/lib/assistant/run';

export const dynamic = 'force-dynamic';

/** Signed-in users: { messages: [{ role, content }] } → the assistant's answer, from the app's own data (read-only). */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Cerere respinsă (origine necunoscută).', 403);
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (rateLimited(`assistant:${user.id}`, 12, 60_000)) return fail('Prea multe întrebări într-un minut. Așteaptă puțin.', 429);
  const body = await req.json().catch(() => null) as { messages?: unknown } | null;
  const messages = (Array.isArray(body?.messages) ? body!.messages : []).filter((m): m is ChatMessage => !!m && typeof m === 'object' && ['user', 'assistant'].includes((m as ChatMessage).role) && typeof (m as ChatMessage).content === 'string' && !!(m as ChatMessage).content.trim());
  if (!messages.length || messages[messages.length - 1].role !== 'user') return fail('Scrie o întrebare.', 400);
  try { return json(await askAssistant(messages, { userId: user.id, owner: canSeeAccounts(user) })); }
  catch (e) { return fail(`Asistentul nu poate răspunde acum: ${(e as Error).message}`, 503); }
}
