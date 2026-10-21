import { NextResponse, type NextRequest } from 'next/server';
import { fail, json, rateLimited, requireUser } from '@/lib/http';
import { loadFixtures } from '@/lib/sports/fixtures';
import { withExtraMarkets } from '@/lib/jobs/pipeline';
import { isBannedMarket } from '@/lib/jobs/analysis';
import { localDate } from '@/lib/time';

export const dynamic = 'force-dynamic';
/** All real markets of one fixture (main + Bet365/DraftKings props), for building your own ticket. No AI. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (rateLimited(`mk:${user.id}`, 40, 60_000)) return fail('Prea multe cereri.', 429);
  const { id } = await ctx.params;
  const { fixtures } = await loadFixtures(localDate(), 7, { top10Only: false, persist: false });
  const f = fixtures.find((x) => x.id === id);
  if (!f) return fail('Meciul nu a fost găsit.', 404);
  const full = await withExtraMarkets(f).catch(() => f);
  return json({ fixtureId: f.id, markets: (full.odds?.markets ?? []).filter((m) => !isBannedMarket(m.key)).map((m) => ({ key: m.key, label: m.label, type: m.marketType, odds: m.odds, bookmaker: m.bookmaker ?? full.odds?.bookmaker })) });
}
