import { NextResponse, type NextRequest } from 'next/server';
import { fail, isUuid, json, requireUser } from '@/lib/http';
import { jobEvents, jobMeta } from '@/lib/views';
import { TERMINAL } from '@/lib/jobs/types';

export const dynamic = 'force-dynamic';
/** Read-only stream of persisted events (SSE) with a JSON polling fallback (?format=json). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail('Identificator invalid.', 400);
  const after = Math.max(0, Number(req.nextUrl.searchParams.get('after') || req.headers.get('last-event-id') || 0));
  if (req.nextUrl.searchParams.get('format') === 'json') {
    const events = await jobEvents(user.id, id, after);
    if (!events) return fail('Analiza nu există.', 404);
    return json({ events, meta: await jobMeta(user.id, id) });
  }
  const meta = await jobMeta(user.id, id);
  if (!meta) return fail('Analiza nu există.', 404);
  const enc = new TextEncoder();
  let cursor = after;
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => { if (!closed) controller.enqueue(enc.encode(s)); };
      const started = Date.now();
      req.signal.addEventListener('abort', () => { closed = true; });
      while (!closed && Date.now() - started < 4 * 60_000) {
        if (await requireUser(req) instanceof NextResponse) break;
        const events = (await jobEvents(user.id, id, cursor)) ?? [];
        for (const e of events) { send(`id: ${e.seq}\nevent: job\ndata: ${JSON.stringify(e)}\n\n`); cursor = e.seq; }
        const m = await jobMeta(user.id, id);
        send(`event: meta\ndata: ${JSON.stringify(m)}\n\n`);
        if (m && (TERMINAL as string[]).includes(m.status) && !events.length) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      send('event: end\ndata: {}\n\n');
      closed = true;
      controller.close();
    },
    cancel() { closed = true; },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
