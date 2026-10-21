import { many, one } from './db';
import { slotInfo } from './slots';
import type { NexusEvent } from './nexus-state';

/**
 * The home page "film": a real, finished analysis replayed on the map. We keep the fixture pool, one batch that
 * actually went to debate (or the first batch) and the outcome, so the loop lasts about a minute.
 */
export async function homeReel(userId: string) {
  const job = await one<{ id: string; slot: string; target_odds: string; required_legs: number | null; finished_at: Date }>(
    `SELECT j.id, j.slot, j.target_odds, j.required_legs, j.finished_at FROM ticket_generation_jobs j
     WHERE j.user_id=$1 AND j.status='COMPLETED'
       AND EXISTS (SELECT 1 FROM analysis_events e WHERE e.job_id=j.id AND e.type='OBJECTION_RECORDED')
     ORDER BY j.finished_at DESC NULLS LAST LIMIT 1`, [userId])
    ?? await one<{ id: string; slot: string; target_odds: string; required_legs: number | null; finished_at: Date }>(
      `SELECT id, slot, target_odds, required_legs, finished_at FROM ticket_generation_jobs WHERE user_id=$1 AND status='COMPLETED' ORDER BY finished_at DESC NULLS LAST LIMIT 1`, [userId]);
  if (!job) return null;
  const rows = await many<{ seq: number; type: string; stage: string; fixture_id: string | null; agent_id: string | null; payload: Record<string, unknown>; created_at: Date }>(
    'SELECT seq, type, stage, fixture_id, agent_id, payload, created_at FROM analysis_events WHERE job_id=$1 ORDER BY seq LIMIT 4000', [job.id]);
  const events: NexusEvent[] = rows.map((r) => ({ seq: r.seq, type: r.type, stage: r.stage, fixtureId: r.fixture_id, agentId: r.agent_id, payload: r.payload as Record<string, any>, createdAt: r.created_at.toISOString() }));
  const batchStarts = events.filter((e) => e.type === 'BATCH_STARTED');
  const debate = events.find((e) => e.type === 'DEBATE_STARTED');
  const chosen = [...batchStarts].reverse().find((b) => !debate || b.seq < debate.seq) ?? batchStarts[0];
  const next = chosen ? batchStarts.find((b) => b.seq > chosen.seq) : undefined;
  const keep = new Set(['JOB_CREATED', 'TARGET_SELECTED', 'CANDIDATE_SELECTED', 'SELECTION_ACCEPTED', 'LEG_REVIEWED', 'OPTIMIZATION_COMPLETED', 'REVIEW_ADVICE', 'TICKET_FINALIZED']);
  const reel = events.filter((e) => keep.has(e.type) || (chosen && e.seq >= chosen.seq && (!next || e.seq < next.seq)));
  const info = slotInfo(job.slot, Number(job.target_odds), job.required_legs);
  return { jobId: job.id, title: info.title, finishedAt: job.finished_at?.toISOString() ?? null, events: reel };
}

/** Real totals for the home page (never estimated). */
export async function homeStats(userId: string) {
  const t = await one<{ tickets: string; won: string; lost: string; legs_won: string; legs_lost: string }>(
    `SELECT (SELECT count(*) FROM tickets WHERE user_id=$1 AND generation_status='COMPLETED') AS tickets,
            (SELECT count(*) FROM tickets WHERE user_id=$1 AND outcome_status IN ('WON','PARTIAL_VOID')) AS won,
            (SELECT count(*) FROM tickets WHERE user_id=$1 AND outcome_status='LOST') AS lost,
            (SELECT count(*) FROM ticket_selections s JOIN tickets t ON t.id=s.ticket_id WHERE t.user_id=$1 AND s.outcome='WON') AS legs_won,
            (SELECT count(*) FROM ticket_selections s JOIN tickets t ON t.id=s.ticket_id WHERE t.user_id=$1 AND s.outcome='LOST') AS legs_lost`, [userId]);
  return { tickets: Number(t?.tickets ?? 0), won: Number(t?.won ?? 0), lost: Number(t?.lost ?? 0), legsWon: Number(t?.legs_won ?? 0), legsLost: Number(t?.legs_lost ?? 0) };
}
