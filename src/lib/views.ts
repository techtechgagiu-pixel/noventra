import { cleanPayload } from './agent-names';
import { many, one } from './db';
import { eventsAfter } from './jobs/events';
import { slotInfo } from './slots';
import { finalAgentPicksCte } from './final-agent-picks';

/** Who made a ticket, as everyone may see it: Google name with a masked e-mail, an invitation label, or the administrator. */
export type Creator = { name: string; detail: string | null; picture: string | null; mine: boolean };
export function creatorOf(r: { creator_id: string; creator_name: string | null; creator_email: string | null; creator_picture: string | null; creator_sub: string | null }, viewerId: string): Creator {
  const mine = r.creator_id === viewerId;
  const sub = r.creator_sub ?? '';
  if (sub === 'owner:primary') return { name: 'Administrator', detail: null, picture: null, mine };
  if (sub.startsWith('invite:')) return { name: r.creator_name || 'Invitat', detail: 'invitat', picture: null, mine };
  const email = r.creator_email ?? '';
  const [local, domain] = email.split('@');
  const masked = local && domain ? `${local.slice(0, 2)}•••@${domain}` : null;
  return { name: r.creator_name || (local ? local.slice(0, 2) + '•••' : 'Cont Google'), detail: masked, picture: r.creator_picture, mine };
}
const CREATOR_COLS = `u.id AS creator_id, u.name AS creator_name, u.email AS creator_email, u.picture AS creator_picture, u.google_sub AS creator_sub`;

/** Shared read access: every signed-in account may watch any analysis; only its creator may act on it. */
export async function jobMeta(userId: string, jobId: string) {
  const j = await one<Record<string, unknown>>(
    `SELECT j.id, j.slot, to_char(j.period_key,'YYYY-MM-DD') AS period_key, j.target_odds, j.required_legs, j.status, j.stage, j.eligible_count, j.last_error, j.next_run_at, j.created_at, j.finished_at, j.last_event_seq, j.checkpoint, t.id AS ticket_id
            , ${CREATOR_COLS}
     FROM ticket_generation_jobs j JOIN users u ON u.id=j.user_id LEFT JOIN tickets t ON t.job_id=j.id WHERE j.id=$1`,
    [jobId],
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
    creator: creatorOf(j as never, userId), mine: j.creator_id === userId,
  };
}

export async function jobEvents(userId: string, jobId: string, after = 0) {
  void userId;
  const exists = await one('SELECT 1 FROM ticket_generation_jobs WHERE id=$1', [jobId]);
  if (!exists) return null;
  return eventsAfter(jobId, after, 1000);
}

/** "Bilete create": every account's tickets, newest first, each with its creator. */
export async function listTickets(userId: string) {
  const rows = await many<Record<string, unknown> & { creator_id: string; creator_name: string | null; creator_email: string | null; creator_picture: string | null; creator_sub: string | null }>(
    `SELECT t.id, t.slot, to_char(t.period_key,'YYYY-MM-DD') AS period_key, t.target_odds::float AS target_odds, t.actual_odds::float AS actual_odds, t.leg_count, t.generation_status, t.outcome_status, t.created_at, t.mixed_bookmakers,
            j.id AS job_id, (SELECT count(*) FROM analysis_events e WHERE e.job_id=j.id)::int AS event_count,
            COALESCE((SELECT json_agg(json_build_object('match', s.snapshot->>'match', 'label', s.market_label, 'market_key', s.market_key, 'model_probability', s.model_probability::float, 'odds', s.odds::float, 'outcome', s.outcome) ORDER BY s.position) FROM ticket_selections s WHERE s.ticket_id=t.id), '[]') AS selections
            , ${CREATOR_COLS}
     FROM tickets t JOIN ticket_generation_jobs j ON j.id=t.job_id JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC`,
  );
  return rows.map(({ creator_id, creator_name, creator_email, creator_picture, creator_sub, ...r }) => ({ ...r, creator: creatorOf({ creator_id, creator_name, creator_email, creator_picture, creator_sub }, userId) }));
}

export async function ticketDetail(userId: string, ticketId: string) {
  const t = await one<Record<string, unknown>>(
    `SELECT t.*, t.target_odds::float AS target, t.actual_odds::float AS actual, to_char(t.period_key,'YYYY-MM-DD') AS period, j.created_at AS job_created, j.finished_at, j.eligible_count, j.seed
            , ${CREATOR_COLS}
     FROM tickets t JOIN ticket_generation_jobs j ON j.id=t.job_id JOIN users u ON u.id=t.user_id WHERE t.id=$1`,
    [ticketId],
  );
  if (!t) return null;
  const selections = await many<Record<string, unknown>>(
    `SELECT s.position, s.fixture_id, s.market_key, s.market_label, s.odds::float AS odds, s.bookmaker, s.quote_observed_at, s.votes_for, s.model_probability::float AS model_probability, s.risk, s.snapshot, s.outcome,
            f.home_score, f.away_score, f.status AS fixture_status
     FROM ticket_selections s JOIN fixtures f ON f.id=s.fixture_id WHERE s.ticket_id=$1 ORDER BY s.position`,
    [ticketId],
  );
  const decisions = await many<Record<string, unknown>>('SELECT fixture_id, outcome, market_key, votes_for, votes, validation, reason FROM final_decisions WHERE job_id=$1 ORDER BY id', [t.job_id]);
  const predictions = await many<Record<string, unknown>>(`${finalAgentPicksCte()} SELECT p.id,p.fixture_id,p.agent_id,p.round,p.provider,p.model_id,p.prompt_version,p.decision,p.market_key,p.estimated_probability::float AS estimated_probability,p.confidence,p.risk,p.payload,p.outcome,p.odds::float AS odds,p.created_at,p.settled_at,(fp.id=p.id) AS current_in_stats FROM agent_predictions p LEFT JOIN final_picks fp ON fp.fixture_id=p.fixture_id AND fp.agent_id=p.agent_id WHERE p.job_id=$1 ORDER BY p.fixture_id,p.agent_id,p.round`, [t.job_id]);
  const dossiers = await many<Record<string, unknown>>('SELECT fixture_id, mode, dossier, narrative, model FROM scout_dossiers WHERE job_id=$1', [t.job_id]);
  const snapshots = await many<{ fixture_id: string; payload: { fixture: unknown; model: unknown; odds: unknown; dataQuality: unknown } }>('SELECT DISTINCT ON (fixture_id) fixture_id, payload FROM fixture_snapshots WHERE job_id=$1 ORDER BY fixture_id, id', [t.job_id]);
  const slot = slotInfo(t.slot as string, Number(t.target_odds), t.leg_count as number);
  return {
    creator: creatorOf(t as never, userId), mine: t.creator_id === userId,
    id: t.id as string, jobId: t.job_id as string, slot: slot.id, title: slot.title, subtitle: slot.subtitle, target: t.target as number, actualOdds: t.actual as number | null,
    legCount: t.leg_count as number, generationStatus: t.generation_status as string, outcomeStatus: t.outcome_status as string, mixedBookmakers: t.mixed_bookmakers as boolean,
    createdAt: new Date(t.created_at as string).toISOString(), periodKey: t.period as string, summary: cleanPayload(t.summary) as Record<string, unknown>, eligibleCount: t.eligible_count as number | null,
    selections, decisions: cleanPayload(decisions), predictions: cleanPayload(predictions), dossiers,
    fixtures: snapshots.map((s) => ({ fixtureId: s.fixture_id, fixture: s.payload.fixture, model: s.payload.model, odds: s.payload.odds, dataQuality: s.payload.dataQuality })),
  };
}
