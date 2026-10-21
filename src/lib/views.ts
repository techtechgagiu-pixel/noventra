import { many, one } from './db';
import { eventsAfter } from './jobs/events';
import { slotInfo } from './slots';

export async function jobMeta(userId: string, jobId: string) {
  const j = await one<Record<string, unknown>>(
    `SELECT j.id, j.slot, to_char(j.period_key,'YYYY-MM-DD') AS period_key, j.target_odds, j.required_legs, j.status, j.stage, j.eligible_count, j.last_error, j.next_run_at, j.created_at, j.finished_at, j.last_event_seq, j.checkpoint, t.id AS ticket_id
     FROM ticket_generation_jobs j LEFT JOIN tickets t ON t.job_id=j.id WHERE j.id=$1 AND j.user_id=$2`,
    [jobId, userId],
  );
  if (!j) return null;
  const slot = slotInfo(j.slot as string, Number(j.target_odds), j.required_legs as number | null);
  const cp = j.checkpoint as { batches?: string[][]; batchIndex?: number; analyzed?: number; qualified?: number };
  return {
    id: j.id as string, slot: slot.id, title: slot.title, subtitle: slot.subtitle, target: Number(j.target_odds), requiredLegs: j.required_legs as number | null,
    periodKey: j.period_key as string, status: j.status as string, stage: j.stage as string, eligibleCount: j.eligible_count as number | null,
    lastError: j.last_error as string | null, nextRunAt: new Date(j.next_run_at as string).toISOString(), createdAt: new Date(j.created_at as string).toISOString(),
    finishedAt: j.finished_at ? new Date(j.finished_at as string).toISOString() : null, lastSeq: j.last_event_seq as number, ticketId: (j.ticket_id as string) ?? null,
    batches: cp.batches?.length ?? 0, batchIndex: cp.batchIndex ?? 0, analyzed: cp.analyzed ?? 0, qualified: cp.qualified ?? 0,
  };
}

export async function jobEvents(userId: string, jobId: string, after = 0) {
  const owner = await one('SELECT 1 FROM ticket_generation_jobs WHERE id=$1 AND user_id=$2', [jobId, userId]);
  if (!owner) return null;
  return eventsAfter(jobId, after, 1000);
}

export async function listTickets(userId: string) {
  return many<Record<string, unknown>>(
    `SELECT t.id, t.slot, to_char(t.period_key,'YYYY-MM-DD') AS period_key, t.target_odds::float AS target_odds, t.actual_odds::float AS actual_odds, t.leg_count, t.generation_status, t.outcome_status, t.created_at, t.mixed_bookmakers,
            j.id AS job_id, (SELECT count(*) FROM analysis_events e WHERE e.job_id=j.id)::int AS event_count,
            COALESCE((SELECT json_agg(json_build_object('match', s.snapshot->>'match', 'label', s.market_label, 'odds', s.odds::float, 'outcome', s.outcome) ORDER BY s.position) FROM ticket_selections s WHERE s.ticket_id=t.id), '[]') AS selections
     FROM tickets t JOIN ticket_generation_jobs j ON j.id=t.job_id WHERE t.user_id=$1 ORDER BY t.created_at DESC LIMIT 300`,
    [userId],
  );
}

export async function ticketDetail(userId: string, ticketId: string) {
  const t = await one<Record<string, unknown>>(
    `SELECT t.*, t.target_odds::float AS target, t.actual_odds::float AS actual, to_char(t.period_key,'YYYY-MM-DD') AS period, j.created_at AS job_created, j.finished_at, j.eligible_count, j.seed
     FROM tickets t JOIN ticket_generation_jobs j ON j.id=t.job_id WHERE t.id=$1 AND t.user_id=$2`,
    [ticketId, userId],
  );
  if (!t) return null;
  const selections = await many<Record<string, unknown>>(
    `SELECT s.position, s.fixture_id, s.market_key, s.market_label, s.odds::float AS odds, s.bookmaker, s.quote_observed_at, s.votes_for, s.model_probability::float AS model_probability, s.risk, s.snapshot, s.outcome,
            f.home_score, f.away_score, f.status AS fixture_status
     FROM ticket_selections s JOIN fixtures f ON f.id=s.fixture_id WHERE s.ticket_id=$1 ORDER BY s.position`,
    [ticketId],
  );
  const decisions = await many<Record<string, unknown>>('SELECT fixture_id, outcome, market_key, votes_for, votes, validation, reason FROM final_decisions WHERE job_id=$1 ORDER BY id', [t.job_id]);
  const predictions = await many<Record<string, unknown>>('SELECT fixture_id, agent_id, round, provider, model_id, prompt_version, decision, market_key, estimated_probability::float AS estimated_probability, confidence, risk, payload FROM agent_predictions WHERE job_id=$1 ORDER BY fixture_id, agent_id, round', [t.job_id]);
  const dossiers = await many<Record<string, unknown>>('SELECT fixture_id, mode, dossier, narrative, model FROM scout_dossiers WHERE job_id=$1', [t.job_id]);
  const snapshots = await many<{ fixture_id: string; payload: { fixture: unknown; model: unknown; odds: unknown; dataQuality: unknown } }>('SELECT DISTINCT ON (fixture_id) fixture_id, payload FROM fixture_snapshots WHERE job_id=$1 ORDER BY fixture_id, id', [t.job_id]);
  const slot = slotInfo(t.slot as string, Number(t.target_odds), t.leg_count as number);
  return {
    id: t.id as string, jobId: t.job_id as string, slot: slot.id, title: slot.title, subtitle: slot.subtitle, target: t.target as number, actualOdds: t.actual as number | null,
    legCount: t.leg_count as number, generationStatus: t.generation_status as string, outcomeStatus: t.outcome_status as string, mixedBookmakers: t.mixed_bookmakers as boolean,
    createdAt: new Date(t.created_at as string).toISOString(), periodKey: t.period as string, summary: t.summary as Record<string, unknown>, eligibleCount: t.eligible_count as number | null,
    selections, decisions, predictions, dossiers,
    fixtures: snapshots.map((s) => ({ fixtureId: s.fixture_id, fixture: s.payload.fixture, model: s.payload.model, odds: s.payload.odds, dataQuality: s.payload.dataQuality })),
  };
}
