import { randomBytes } from 'node:crypto';
import { config } from '../config';
import { many, one, tx } from '../db';
import { providerConfigured, resetModelExhaustion } from '../ai/router';
import { aiUsageToday } from '../usage';
import { SLOTS, fixtureWindow, nextReset, periodKey, slotById, type SlotDefinition } from '../slots';
import { recordEvent } from './events';
import type { Checkpoint } from './types';
import { kickWorker } from './worker';

export class SlotError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export type SlotState = {
  slot: SlotDefinition;
  periodKey: string;
  nextReset: string;
  job: null | { id: string; status: string; stage: string; createdAt: string; lastError: string | null; nextRunAt: string };
  ticket: null | { id: string; generationStatus: string; actualOdds: number | null; legCount: number; createdAt: string; outcomeStatus: string };
  action: 'CREATE' | 'VIEW_ANALYSIS' | 'VIEW_TICKET' | 'VIEW_RESULT' | 'RESUME';
};

export async function slotStates(userId: string, at = new Date()): Promise<SlotState[]> {
  const keys = SLOTS.map((s) => periodKey(s, at));
  const rows = await many<{ id: string; slot: string; period_key: string; status: string; stage: string; created_at: Date; last_error: string | null; next_run_at: Date; ticket_id: string | null; generation_status: string | null; actual_odds: string | null; leg_count: number | null; t_created: Date | null; outcome_status: string | null }>(
    `SELECT j.id, j.slot, to_char(j.period_key,'YYYY-MM-DD') AS period_key, j.status, j.stage, j.created_at, j.last_error, j.next_run_at,
            t.id AS ticket_id, t.generation_status, t.actual_odds, t.leg_count, t.created_at AS t_created, t.outcome_status
     FROM ticket_generation_jobs j LEFT JOIN tickets t ON t.job_id=j.id
     WHERE j.user_id=$1 AND j.period_key = ANY($2::date[])`,
    [userId, [...new Set(keys)]],
  );
  return SLOTS.map((slot, i) => {
    const r = rows.find((x) => x.slot === slot.id && x.period_key === keys[i]);
    const job = r ? { id: r.id, status: r.status, stage: r.stage, createdAt: r.created_at.toISOString(), lastError: r.last_error, nextRunAt: r.next_run_at.toISOString() } : null;
    const ticket = r?.ticket_id ? { id: r.ticket_id, generationStatus: r.generation_status!, actualOdds: r.actual_odds ? Number(r.actual_odds) : null, legCount: r.leg_count ?? 0, createdAt: r.t_created!.toISOString(), outcomeStatus: r.outcome_status! } : null;
    const action: SlotState['action'] = !job ? 'CREATE' : ticket ? (ticket.generationStatus === 'COMPLETED' ? 'VIEW_TICKET' : 'VIEW_RESULT') : job.status === 'PAUSED' || job.status === 'FAILED' ? 'RESUME' : 'VIEW_ANALYSIS';
    return { slot, periodKey: keys[i], nextReset: nextReset(slot, at), job, ticket, action };
  });
}

/** Rough per-job AI call estimate, used to refuse before consuming the slot when quota is clearly short. */
export function estimateCalls(slot: SlotDefinition) {
  const fixtures = slot.period === 'weekly' ? config.limits.maxFixturesWeekly : config.limits.maxFixturesDaily;
  const batches = Math.ceil(fixtures / config.limits.batchSize);
  return { firstBatch: 1 + 6 + 6, worstCase: batches * (1 + 6 + 6 + 3) };
}

/**
 * Creates the one allowed job for (user, slot, period) or returns the existing one.
 * Uniqueness is enforced by the database; concurrent requests converge on the same row.
 */
export async function createOrGetJob(userId: string, slotId: string, at = new Date()) {
  const slot = slotById(slotId);
  if (!slot) throw new SlotError('Slot necunoscut.', 404);
  const key = periodKey(slot, at);
  const existing = await one<{ id: string }>('SELECT id FROM ticket_generation_jobs WHERE user_id=$1 AND slot=$2 AND period_key=$3', [userId, slot.id, key]);
  if (existing) return { jobId: existing.id, created: false };

  // Prerequisites are checked BEFORE reserving the slot, so a known missing prerequisite never consumes it.
  if (!providerConfigured('groq') && !providerConfigured('gemini') && !config.allowDemoProviders) throw new SlotError('Niciun furnizor AI nu este configurat pe server. Slotul nu a fost consumat.', 503);
  const usage = await aiUsageToday();
  const est = estimateCalls(slot);
  if (usage.requests + est.firstBatch > config.limits.aiDailyCalls) throw new SlotError(`Cota AI zilnică a aplicației este aproape epuizată (${usage.requests}/${config.limits.aiDailyCalls} apeluri). Slotul nu a fost consumat; încearcă după miezul nopții UTC.`, 503);
  const running = await one<{ n: string }>("SELECT count(*) AS n FROM ticket_generation_jobs WHERE status IN ('QUEUED','RUNNING','WAITING')");
  if (Number(running?.n ?? 0) >= config.limits.maxConcurrentJobs * 4) throw new SlotError('Prea multe analize în desfășurare acum. Încearcă din nou în câteva minute. Slotul nu a fost consumat.', 503);

  const window = fixtureWindow(slot, at);
  let avoidFixtures: string[] = [];
  if (slot.variant === 'B') {
    const sibling = slot.id === 'FIVE_B' ? 'FIVE_A' : 'TWO_A';
    avoidFixtures = (await many<{ fixture_id: string }>(
      `SELECT s.fixture_id FROM ticket_selections s JOIN tickets t ON t.id=s.ticket_id WHERE t.user_id=$1 AND t.slot=$2 AND t.period_key=$3`, [userId, sibling, key])).map((r) => r.fixture_id);
  }
  const seed = randomBytes(16).toString('hex');
  const cfg = { windowStart: window.startDate, windowDays: window.days, top10Only: false, maxFixtures: slot.period === 'weekly' ? config.limits.maxFixturesWeekly : config.limits.maxFixturesDaily, batchSize: config.limits.batchSize, avoidFixtures };
  const checkpoint: Checkpoint = { phase: 'DISCOVER', batchIndex: 0, batchStep: 'FETCH', batches: [], agentsDone: [], analyzed: 0, qualified: 0 };
  const created = await tx(async (c) => {
    const ins = await c.query(
      `INSERT INTO ticket_generation_jobs (user_id, slot, period_key, target_odds, required_legs, seed, config, checkpoint, status, stage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'QUEUED','QUEUED') ON CONFLICT (user_id, slot, period_key) DO NOTHING RETURNING id`,
      [userId, slot.id, key, slot.target, slot.requiredLegs, seed, JSON.stringify(cfg), JSON.stringify(checkpoint)],
    );
    if (!ins.rows[0]) return null;
    const id = ins.rows[0].id as string;
    await recordEvent(id, { type: 'JOB_CREATED', stage: 'QUEUED', payload: { slot: slot.id, title: slot.title, period: key, authorizedBy: 'click CREEAZĂ BILETUL' } }, c);
    await recordEvent(id, { type: 'TARGET_SELECTED', stage: 'QUEUED', payload: { target: slot.target, requiredLegs: slot.requiredLegs, tolerance: config.limits.targetTolerance, window: cfg } }, c);
    await recordEvent(id, { type: 'SEED_GENERATED', stage: 'QUEUED', payload: { seedPrefix: seed.slice(0, 12), note: 'Seed generat pe server; determină doar ordinea de explorare a meciurilor.' } }, c);
    await c.query("INSERT INTO audit_logs(user_id, action, detail) VALUES ($1,'job_created',$2)", [userId, JSON.stringify({ jobId: id, slot: slot.id, period: key })]);
    return id;
  });
  if (!created) {
    const again = await one<{ id: string }>('SELECT id FROM ticket_generation_jobs WHERE user_id=$1 AND slot=$2 AND period_key=$3', [userId, slot.id, key]);
    return { jobId: again!.id, created: false };
  }
  kickWorker();
  return { jobId: created, created: true };
}

/** Resumes the SAME job (same seed, same candidate order). Never creates a new draw. */
export async function resumeJob(userId: string, jobId: string) {
  const job = await one<{ status: string }>('SELECT status FROM ticket_generation_jobs WHERE id=$1 AND user_id=$2', [jobId, userId]);
  if (!job) throw new SlotError('Analiza nu există.', 404);
  if (!['PAUSED', 'FAILED', 'WAITING'].includes(job.status)) return { resumed: false, status: job.status };
  resetModelExhaustion();
  await tx(async (c) => {
    await c.query("UPDATE ticket_generation_jobs SET status='QUEUED', next_run_at=now(), attempt_count=0, last_error=NULL, lease_owner=NULL, lease_expires_at=NULL WHERE id=$1", [jobId]);
    await recordEvent(jobId, { type: 'JOB_RESUMED', stage: 'QUEUED', payload: { by: 'user', note: 'Reluare a aceleiași analize, cu același seed și aceeași ordine a meciurilor.' } }, c);
  });
  kickWorker();
  return { resumed: true, status: 'QUEUED' };
}
