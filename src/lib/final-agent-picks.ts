import { dialect } from './db';

/** One final round per analysis, then the latest analysis of each match by each agent.
 * Select the final position BEFORE filtering bets/results, so a later NO_BET cannot revive an older win.
 * Scope is a fixed SQL fragment, never user-provided SQL.
 */
/** Sport of the picks: football and Counter-Strike (fixtures ps:…) are judged separately (owner request 30.10), so CS
 * results never move an agent's football record, coaching, calibration or vote weight. 'all' = both (ticket pages). */
export type PickSport = 'football' | 'cs' | 'all';
export function finalAgentPicksCte(mine = false, sport: PickSport = 'football') {
  const where = [mine ? `(${dialect('$1::uuid', '$1')} IS NULL OR j.user_id=$1)` : '', sport === 'cs' ? "p.fixture_id LIKE 'ps:%'" : sport === 'football' ? "p.fixture_id NOT LIKE 'ps:%'" : ''].filter(Boolean);
  return `WITH rounds_ranked AS (
    SELECT p.id,p.job_id,p.fixture_id,p.agent_id,p.round,p.created_at,
           ROW_NUMBER() OVER (PARTITION BY p.job_id,p.fixture_id,p.agent_id ORDER BY p.round DESC,p.id DESC) AS rn_round
    FROM agent_predictions p JOIN ticket_generation_jobs j ON j.id=p.job_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
  ), final_round AS (
    SELECT * FROM rounds_ranked WHERE rn_round=1
  ), picks_ranked AS (
    SELECT final_round.*,ROW_NUMBER() OVER (PARTITION BY fixture_id,agent_id ORDER BY created_at DESC,id DESC) AS rn_pick FROM final_round
  ), final_picks AS (
    SELECT p.* FROM picks_ranked latest JOIN agent_predictions p ON p.id=latest.id WHERE latest.rn_pick=1
  )`;
}
