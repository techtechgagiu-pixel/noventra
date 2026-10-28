import { many, dialect } from './db';
import { resolvedOutcome } from './settlement';

export type IncompletePick = {
  position: number; fixture_id: string; market_key: string; market_label: string; odds: number | null;
  bookmaker: string; quote_observed_at: string; votes_for: number; model_probability: number | null; risk: string;
  snapshot: { match: string; home: string; away: string; league: string; kickoff: string; source: string };
  outcome: string; home_score: number | null; away_score: number | null;
  fixture_status?: string | null; live_clock?: string | null; score_at?: string | null;
};

type Row = {
  ticket_id: string; fixture_id: string; market_key: string; votes_for: number; created_at: Date;
  validation: { currentOdds?: number; bookmaker?: string; observedAt?: string };
  payload: { fixture?: { home?: string; away?: string; league?: string }; model?: { markets?: Array<{ key: string; label: string; estimatedProbability?: number; odds?: number }> }; odds?: { source?: string } } | null;
  home_team: string; away_team: string; league: string; status: string; kickoff_utc: Date;
  live_clock: string | null; source_observed_at: Date | string | null;
  home_score: number | null; away_score: number | null; ht_home: number | null; ht_away: number | null; corners_home: number | null; corners_away: number | null;
};
const price = (value: unknown) => value != null && Number.isFinite(Number(value)) && Number(value) > 1 ? Number(value) : null;

/** Read-only projection of validated candidates. These are NOT finalized ticket legs.
 * Uses the saved final market/quote and the same confirmed-result resolver as ordinary legs.
 * A batch supports both the archive and detail, including tickets created before this view existed. */
export async function incompleteTicketPicks(ticketIds: string[]) {
  const grouped = new Map<string, IncompletePick[]>();
  if (!ticketIds.length) return grouped;
  const rows = await many<Row>(
    `SELECT t.id AS ticket_id,d.fixture_id,d.market_key,d.votes_for,d.validation,d.created_at,
       (SELECT snap.payload FROM fixture_snapshots snap WHERE snap.job_id=d.job_id AND snap.fixture_id=d.fixture_id ORDER BY snap.id DESC LIMIT 1) AS payload,
       f.home_team,f.away_team,COALESCE(l.name,f.league_id) AS league,f.status,f.kickoff_utc,
       f.live_clock,f.source_observed_at,f.home_score,f.away_score,f.ht_home,f.ht_away,f.corners_home,f.corners_away
     FROM tickets t JOIN final_decisions d ON d.job_id=t.job_id AND d.outcome='QUALIFIED' AND d.market_key IS NOT NULL
     JOIN fixtures f ON f.id=d.fixture_id LEFT JOIN leagues l ON l.id=f.league_id
     WHERE ${dialect('t.id=ANY($1::uuid[])', 't.id IN (SELECT value FROM json_each($1))')} AND t.generation_status='INCOMPLETE'
     ORDER BY t.id,f.kickoff_utc,d.id`, [ticketIds]);
  for (const r of rows) {
    const list = grouped.get(r.ticket_id) ?? [];
    const market = r.payload?.model?.markets?.find((m) => m.key === r.market_key);
    const home = r.payload?.fixture?.home || r.home_team, away = r.payload?.fixture?.away || r.away_team;
    list.push({ position: list.length + 1, fixture_id: r.fixture_id, market_key: r.market_key, market_label: market?.label || r.market_key,
      odds: price(r.validation.currentOdds) ?? price(market?.odds), bookmaker: r.validation.bookmaker || '—',
      quote_observed_at: r.validation.observedAt || r.created_at.toISOString(), votes_for: r.votes_for,
      model_probability: market?.estimatedProbability ?? null, risk: '',
      snapshot: { match: `${home} – ${away}`, home, away, league: r.payload?.fixture?.league || r.league, kickoff: r.kickoff_utc.toISOString(), source: r.payload?.odds?.source || '' },
      outcome: resolvedOutcome(r,r.market_key) ?? 'PENDING', home_score: r.home_score, away_score: r.away_score,
      fixture_status: r.status, live_clock: r.live_clock, score_at: r.source_observed_at ? new Date(r.source_observed_at).toISOString() : null });
    grouped.set(r.ticket_id, list);
  }
  return grouped;
}
