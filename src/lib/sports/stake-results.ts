import { many, one, query, SQL_NOW } from '../db';

/**
 * Stake-only fixtures (02.11) have no automatic results: the owner types the final score here. A fixture is listed
 * once it started at least 105 minutes ago and the agents analysed it (a ticket leg or a vote waits for it).
 * The settlement automation (every few minutes) then settles the legs exactly as for ESPN results.
 */
export type PendingResult = { id: string; home: string; away: string; league: string; kickoff: string; legs: number };

export async function pendingStakeResults(): Promise<PendingResult[]> {
  const rows = await many<{ id: string; home_team: string; away_team: string; league: string; kickoff_utc: string | Date; legs: number | string }>(
    `SELECT f.id, f.home_team, f.away_team, l.name AS league, f.kickoff_utc,
            (SELECT count(*) FROM ticket_selections s WHERE s.fixture_id=f.id) AS legs
       FROM fixtures f JOIN leagues l ON l.id=f.league_id
      WHERE f.provider='stake' AND f.status NOT IN ('post','cancelled') AND f.kickoff_utc <= $1
        AND (EXISTS (SELECT 1 FROM ticket_selections s WHERE s.fixture_id=f.id) OR EXISTS (SELECT 1 FROM agent_predictions p WHERE p.fixture_id=f.id AND p.decision='BET_CANDIDATE'))
      ORDER BY f.kickoff_utc LIMIT 200`, [new Date(Date.now() - 105 * 60_000).toISOString()]);
  return rows.map((r) => ({ id: r.id, home: r.home_team, away: r.away_team, league: r.league, kickoff: new Date(r.kickoff_utc).toISOString(), legs: Number(r.legs) }));
}

export class ResultError extends Error {}
const goals = (v: unknown, label: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 30) throw new ResultError(`${label}: un număr întreg între 0 și 30.`);
  return n;
};

/** Saves a final score typed by the owner (or "anulat"), only for Stake-only fixtures that already started. */
export async function saveStakeResult(input: { fixtureId?: unknown; home?: unknown; away?: unknown; htHome?: unknown; htAway?: unknown; cancelled?: unknown }) {
  const id = String(input.fixtureId ?? '');
  const f = await one<{ kickoff_utc: string | Date }>(`SELECT kickoff_utc FROM fixtures WHERE id=$1 AND provider='stake'`, [id]);
  if (!f) throw new ResultError('Meciul nu există sau nu este un meci doar-Stake.');
  if (Date.parse(new Date(f.kickoff_utc).toISOString()) > Date.now()) throw new ResultError('Meciul nu a început încă.');
  if (input.cancelled === true) {
    await query(`UPDATE fixtures SET status='cancelled', source_observed_at=${SQL_NOW()}, results_checked_at=${SQL_NOW()} WHERE id=$1`, [id]);
    return { id, status: 'cancelled' as const };
  }
  const home = goals(input.home, 'Gazde'), away = goals(input.away, 'Oaspeți');
  const ht = input.htHome === undefined || input.htHome === null || input.htHome === '' ? null : [goals(input.htHome, 'Pauză gazde'), goals(input.htAway, 'Pauză oaspeți')];
  if (ht && (ht[0] > home || ht[1] > away)) throw new ResultError('Scorul la pauză nu poate fi mai mare decât cel final.');
  await query(`UPDATE fixtures SET status='post', home_score=$2, away_score=$3, ht_home=$4, ht_away=$5, live_clock=NULL, source_observed_at=${SQL_NOW()}, results_checked_at=${SQL_NOW()}, updated_at=${SQL_NOW()} WHERE id=$1`,
    [id, home, away, ht ? ht[0] : null, ht ? ht[1] : null]);
  return { id, status: 'post' as const, home, away };
}
