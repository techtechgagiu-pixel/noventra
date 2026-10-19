import { NextResponse, type NextRequest } from 'next/server';
import { json, rateLimited, requireUser } from '@/lib/http';
import { loadFixtures } from '@/lib/sports/fixtures';
import { localDate } from '@/lib/time';

export const dynamic = 'force-dynamic';
/** Real fixtures (cached ≤10 min). Viewing never triggers AI and never rewrites the database. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (rateLimited(`fx:${user.id}`, 30, 60_000)) return json({ error: 'Prea multe cereri.' }, 429);
  const days = Math.min(7, Math.max(1, Number(req.nextUrl.searchParams.get('days') || 5)));
  const data = await loadFixtures(localDate(), days, { top10Only: true, persist: false });
  return json({
    fetchedAt: data.fetchedAt, days: data.days, errors: data.errors, leagues: data.leagues,
    fixtures: data.fixtures.map((f) => ({ id: f.id, league: f.leagueName, country: f.country, leagueId: f.leagueId, home: f.home, away: f.away, homeLogo: f.homeLogo, awayLogo: f.awayLogo, kickoff: f.kickoff, status: f.status, score: f.homeScore != null ? `${f.homeScore}–${f.awayScore}` : null, odds: f.odds ? { bookmaker: f.odds.bookmaker, observedAt: f.odds.observedAt, markets: f.odds.markets } : null, source: f.provider === 'lpf' ? 'LPF (oficial)' : 'ESPN' })),
  });
}
