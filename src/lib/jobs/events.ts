import { one, type Db, pool } from '../db';

export type EventType =
  | 'JOB_CREATED' | 'TARGET_SELECTED' | 'SEED_GENERATED' | 'POOL_BUILT' | 'CANDIDATE_SELECTED' | 'CANDIDATE_REJECTED' | 'BATCH_STARTED'
  | 'SCOUT_STARTED' | 'SCOUT_COMPLETED' | 'STATS_COMPLETED'
  | 'AGENT_STARTED' | 'AGENT_COMPLETED' | 'AGENT_FAILED' | 'PREDICTION_SAVED'
  | 'DEBATE_STARTED' | 'OBJECTION_RECORDED' | 'POSITION_REVISED' | 'DEBATE_SKIPPED'
  | 'VOTE_SUBMITTED' | 'VOTE_SET_ASIDE' | 'CONSENSUS_CALCULATED' | 'ODDS_VALIDATED' | 'SELECTION_ACCEPTED' | 'SELECTION_REJECTED'
  | 'OPTIMIZATION_COMPLETED' | 'TICKET_FINALIZED' | 'JOB_WAITING' | 'JOB_PAUSED' | 'JOB_RESUMED' | 'JOB_FAILED' | 'STAGE_CHANGED';

export type JobEvent = { seq: number; type: EventType; stage: string; fixtureId: string | null; agentId: string | null; payload: Record<string, unknown>; createdAt: string };

/** Appends a meaningful workflow event with a gap-free per-job sequence number. */
export async function recordEvent(jobId: string, e: { type: EventType; stage: string; fixtureId?: string | null; agentId?: string | null; payload?: Record<string, unknown> }, db: Db = pool()) {
  const row = await one<{ seq: number }>(
    `WITH bumped AS (UPDATE ticket_generation_jobs SET last_event_seq = last_event_seq + 1, updated_at = now() WHERE id = $1 RETURNING last_event_seq)
     INSERT INTO analysis_events (job_id, seq, type, stage, fixture_id, agent_id, payload)
     SELECT $1, last_event_seq, $2, $3, $4, $5, $6 FROM bumped RETURNING seq`,
    [jobId, e.type, e.stage, e.fixtureId ?? null, e.agentId ?? null, JSON.stringify(e.payload ?? {})],
    db,
  );
  return row?.seq ?? 0;
}

export async function eventsAfter(jobId: string, afterSeq: number, limit = 500, db: Db = pool()): Promise<JobEvent[]> {
  const res = await db.query(
    `SELECT seq, type, stage, fixture_id, agent_id, payload, created_at FROM analysis_events WHERE job_id=$1 AND seq>$2 ORDER BY seq LIMIT $3`,
    [jobId, afterSeq, limit],
  );
  return res.rows.map((r) => ({ seq: r.seq, type: r.type, stage: r.stage, fixtureId: r.fixture_id, agentId: r.agent_id, payload: r.payload, createdAt: new Date(r.created_at).toISOString() }));
}
