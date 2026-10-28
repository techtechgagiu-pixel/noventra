import { many, one } from './db';

/**
 * Real results for the logged-out home page: the latest won ticket and the settled totals.
 * Nothing about who made the ticket is read; on any database problem the page simply shows no proof block.
 */
export type ProofLeg = { home: string; away: string; label: string; odds: number; homeScore: number | null; awayScore: number | null };
export type PublicProof = {
  lastWon: { odds: number; legs: ProofLeg[]; settledAt: string } | null;
  tickets: { won: number; settled: number };
  picks: { won: number; decided: number };
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

export async function publicProof(): Promise<PublicProof | null> {
  try {
    const won = await one<{ id: string; actual_odds: number | string; settled_at: string | Date }>(
      `SELECT id, actual_odds, settled_at FROM tickets
        WHERE outcome_status='WON' AND generation_status='COMPLETED' AND hidden_at IS NULL AND settled_at IS NOT NULL
        ORDER BY settled_at DESC LIMIT 1`);
    const legs = won ? await many<{ home_team: string; away_team: string; market_label: string; odds: number | string; home_score: number | null; away_score: number | null }>(
      `SELECT f.home_team, f.away_team, s.market_label, s.odds, f.home_score, f.away_score
         FROM ticket_selections s JOIN fixtures f ON f.id=s.fixture_id WHERE s.ticket_id=$1 ORDER BY s.position`, [won.id]) : [];
    const t = await one<{ won: number; settled: number }>(
      `SELECT SUM(CASE WHEN outcome_status='WON' THEN 1 ELSE 0 END) AS won, COUNT(*) AS settled
         FROM tickets WHERE hidden_at IS NULL AND outcome_status IN ('WON','LOST')`);
    const p = await one<{ won: number; decided: number }>(
      `SELECT SUM(CASE WHEN s.outcome='WON' THEN 1 ELSE 0 END) AS won, COUNT(*) AS decided
         FROM ticket_selections s JOIN tickets t ON t.id=s.ticket_id WHERE t.hidden_at IS NULL AND s.outcome IN ('WON','LOST')`);
    return {
      lastWon: won && legs.length ? {
        odds: num(won.actual_odds),
        settledAt: new Date(won.settled_at).toISOString(),
        legs: legs.map((l) => ({ home: l.home_team, away: l.away_team, label: l.market_label, odds: num(l.odds), homeScore: l.home_score, awayScore: l.away_score })),
      } : null,
      tickets: { won: num(t?.won), settled: num(t?.settled) },
      picks: { won: num(p?.won), decided: num(p?.decided) },
    };
  } catch {
    return null;
  }
}
