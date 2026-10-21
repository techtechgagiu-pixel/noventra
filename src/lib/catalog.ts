import { many } from './db';
import { loadFixtures } from './sports/fixtures';
import { localDate } from './time';
import type { Fixture } from './sports/types';

/**
 * Every fixture the sources publish for the next days, shared by the "Meciuri" tab and the custom-ticket league picker.
 * Stale-while-revalidate: a reader gets the last snapshot at once and a refresh starts in the background; only the very
 * first read waits. Reading never triggers AI.
 */
type Snapshot = Awaited<ReturnType<typeof loadFixtures>>;
const g = globalThis as unknown as { __bmCatalog?: { data: Snapshot | null; at: number; running: Promise<void> | null } };
const state = (g.__bmCatalog ??= { data: null, at: 0, running: null });
const FRESH_MS = 10 * 60_000;
export const CATALOG_DAYS = 8;

export async function fixtureCatalog() {
  if ((!state.data || Date.now() - state.at > FRESH_MS || state.data.days[0] !== localDate()) && !state.running) {
    state.running = loadFixtures(localDate(), CATALOG_DAYS, { top10Only: false, persist: false })
      .then((d) => { state.data = d; state.at = Date.now(); })
      .catch((e) => { console.warn(JSON.stringify({ event: 'catalog_failed', message: (e as Error).message })); })
      .finally(() => { state.running = null; });
  }
  if (!state.data && state.running) await state.running;
  return { data: state.data, refreshing: !!state.running, at: state.at };
}

export type MatchRow = {
  id: string; leagueId: string; league: string; country: string; home: string; away: string; homeLogo: string | null; awayLogo: string | null;
  kickoff: string; status: string; score: string | null; odds: { home: number | null; draw: number | null; away: number | null; markets: number; bookmaker: string } | null;
  analysis: { outcome: string; label: string | null; odds: number | null; votes: number; onTicket: boolean; at: string; jobId: string } | null;
};

/** The catalog joined with this user's latest analysis of each fixture (team decision, and whether it made a ticket). */
export async function matchList(userId: string) {
  const { data, refreshing, at } = await fixtureCatalog();
  const fixtures: Fixture[] = data?.fixtures ?? [];
  const ids = fixtures.map((f) => f.id);
  const decided = ids.length ? await many<{ fixture_id: string; outcome: string; market_key: string | null; votes_for: number; created_at: Date; job_id: string; label: string | null; odds: string | null; on_ticket: boolean }>(
    `SELECT DISTINCT ON (fd.fixture_id) fd.fixture_id, fd.outcome, fd.market_key, fd.votes_for, fd.created_at, fd.job_id,
            COALESCE(ts.market_label, (SELECT p.payload->>'marketLabel' FROM agent_predictions p WHERE p.job_id=fd.job_id AND p.fixture_id=fd.fixture_id AND p.market_key=fd.market_key LIMIT 1)) AS label,
            COALESCE(ts.odds, (SELECT p.odds FROM agent_predictions p WHERE p.job_id=fd.job_id AND p.fixture_id=fd.fixture_id AND p.market_key=fd.market_key AND p.odds IS NOT NULL LIMIT 1)) AS odds,
            ts.ticket_id IS NOT NULL AS on_ticket
     FROM final_decisions fd JOIN ticket_generation_jobs j ON j.id=fd.job_id
     LEFT JOIN tickets t ON t.job_id=fd.job_id LEFT JOIN ticket_selections ts ON ts.ticket_id=t.id AND ts.fixture_id=fd.fixture_id
     WHERE j.user_id=$1 AND fd.fixture_id = ANY($2)
     ORDER BY fd.fixture_id, (ts.ticket_id IS NOT NULL) DESC, fd.created_at DESC`, [userId, ids]) : [];
  const byFixture = new Map(decided.map((d) => [d.fixture_id, d]));
  const price = (f: Fixture, key: string) => f.odds?.markets.find((m) => m.key === key)?.odds ?? null;
  const rows: MatchRow[] = fixtures.map((f) => {
    const d = byFixture.get(f.id);
    return {
      id: f.id, leagueId: f.leagueId, league: f.leagueName, country: f.country, home: f.home, away: f.away, homeLogo: f.homeLogo ?? null, awayLogo: f.awayLogo ?? null,
      kickoff: f.kickoff, status: f.status, score: f.homeScore != null ? `${f.homeScore}–${f.awayScore}` : null,
      odds: f.odds ? { home: price(f, '1X2:HOME'), draw: price(f, '1X2:DRAW'), away: price(f, '1X2:AWAY'), markets: f.odds.markets.length, bookmaker: f.odds.bookmaker } : null,
      analysis: d ? { outcome: d.outcome, label: d.label, odds: d.odds === null ? null : Number(d.odds), votes: d.votes_for, onTicket: d.on_ticket, at: new Date(d.created_at).toISOString(), jobId: d.job_id } : null,
    };
  });
  const leagues = (data?.leagues ?? []).map((l) => ({ id: l.id, name: l.name, country: l.country, top10: l.top10, count: rows.filter((r) => r.leagueId === l.id).length }));
  return { rows, leagues, refreshing, updatedAt: at ? new Date(at).toISOString() : null, errors: (data?.errors ?? []).length };
}
