/** One final round per analysis, then the latest analysis of each match by each agent.
 * Select the final position BEFORE filtering bets/results, so a later NO_BET cannot revive an older win.
 * Scope is a fixed SQL fragment, never user-provided SQL.
 */
export function finalAgentPicksCte(mine = false) {
  return `WITH final_round AS (
    SELECT DISTINCT ON (p.job_id,p.fixture_id,p.agent_id) p.*
    FROM agent_predictions p JOIN ticket_generation_jobs j ON j.id=p.job_id
    ${mine ? 'WHERE ($1::uuid IS NULL OR j.user_id=$1)' : ''}
    ORDER BY p.job_id,p.fixture_id,p.agent_id,p.round DESC,p.id DESC
  ), final_picks AS (
    SELECT DISTINCT ON (fixture_id,agent_id) * FROM final_round
    ORDER BY fixture_id,agent_id,created_at DESC,id DESC
  )`;
}
