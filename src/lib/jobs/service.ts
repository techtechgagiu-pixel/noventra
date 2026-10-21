import { randomBytes } from 'node:crypto';
import { config } from '../config';
import { many, one, tx } from '../db';
import { providerConfigured, resetModelExhaustion } from '../ai/router';
import { aiUsageToday } from '../usage';
import { CUSTOM_LIMIT_PER_DAY, REVIEW_LIMIT_PER_DAY, SLOTS, customPolicy, isCustomSlot, isReviewSlot, slotInfo, type ReviewLeg, fixtureWindow, nextReset, periodKey, slotById, type CustomConfig, type SlotDefinition } from '../slots';
import { VOTING_AGENTS } from '../ai/agents';
import { localDate } from '../time';
import { recordEvent } from './events';
import type { Checkpoint } from './types';
import { kickWorker } from './worker';
import { loadFixtures } from '../sports/fixtures';
import { withExtraMarkets } from './pipeline';
import { isBannedMarket } from './analysis';

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

/** Validates a custom request; returns a normalised config or throws a SlotError with a readable message. */
export function parseCustom(input: unknown): CustomConfig {
  const o = (input ?? {}) as Record<string, unknown>;
  const target = Math.round(Number(o.target) * 100) / 100;
  const legs = Math.round(Number(o.legs));
  const ids = new Set<string>(VOTING_AGENTS.map((a) => a.id));
  const agents = [...new Set(Array.isArray(o.agents) ? o.agents.map(String) : [])].filter((a) => ids.has(a));
  let fromHours = o.fromHours === undefined ? 2 : Math.round(Number(o.fromHours) * 4) / 4;
  let toHours = o.toHours === undefined ? (o.window === '7d' ? 168 : o.window === '24h' ? 24 : 48) : Math.round(Number(o.toHours) * 4) / 4;
  if (!Number.isFinite(fromHours) || !Number.isFinite(toHours)) throw new SlotError('Intervalul meciurilor nu este valid.');
  fromHours = Math.min(167, Math.max(0.5, fromHours)); toHours = Math.min(168, Math.max(fromHours + 1, toHours));
  const window = toHours > 48 ? '7d' : toHours > 24 ? '48h' : '24h';
  if (!Number.isFinite(target) || target < 1.2 || target > 1000) throw new SlotError('Cota țintă trebuie să fie între 1.20 și 1000.');
  if (!Number.isInteger(legs) || legs < 1 || legs > 15) throw new SlotError('Numărul de meciuri trebuie să fie între 1 și 15.');
  if (!agents.length) throw new SlotError('Alege cel puțin un agent.');
  const perLeg = Math.pow(target, 1 / legs);
  if (perLeg < 1.1) throw new SlotError(`Cota ${target} din ${legs} meciuri înseamnă ~${perLeg.toFixed(2)} pe meci — prea mică pentru cotele reale. Pune mai puține meciuri sau o cotă mai mare.`);
  if (perLeg > 3.2) throw new SlotError(`Cota ${target} din ${legs} meciuri înseamnă ~${perLeg.toFixed(2)} pe meci — prea riscant. Pune mai multe meciuri sau o cotă mai mică.`);
  return { target, legs, agents, window, fromHours, toHours };
}

/** Creates a custom ticket job (CUSTOM_1…CUSTOM_10 per day): the user's target, exact legs and chosen agents. */
export async function createCustomJob(userId: string, input: unknown, at = new Date()) {
  const custom = parseCustom(input);
  if (!providerConfigured('groq') && !providerConfigured('gemini') && !providerConfigured('openrouter') && !config.allowDemoProviders) throw new SlotError('Niciun furnizor AI nu este configurat pe server.', 503);
  const usage = await aiUsageToday();
  if (usage.requests + 20 > config.limits.aiDailyCalls) throw new SlotError(`Cota AI zilnică este aproape epuizată (${usage.requests}/${config.limits.aiDailyCalls} apeluri).`, 503);
  const key = localDate(at);
  const policy = customPolicy(custom);
  const weekly = (custom.toHours ?? 48) > 48;
  const days = Math.min(8, Math.ceil((custom.toHours ?? 48) / 24) + 1);
  const maxFixtures = Math.min(weekly ? config.limits.maxFixturesWeekly : config.limits.maxFixturesDaily, Math.max(12, custom.legs * 4));
  const cfg = { windowStart: key, windowDays: days, top10Only: false, maxFixtures, batchSize: config.limits.batchSize, avoidFixtures: [] as string[], custom };
  const seed = randomBytes(16).toString('hex');
  const checkpoint: Checkpoint = { phase: 'DISCOVER', batchIndex: 0, batchStep: 'FETCH', batches: [], agentsDone: [], analyzed: 0, qualified: 0 };
  const id = await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`custom:${userId}:${key}`]);
    const n = Number((await c.query("SELECT count(*) AS n FROM ticket_generation_jobs WHERE user_id=$1 AND period_key=$2 AND slot LIKE 'CUSTOM\\_%'", [userId, key])).rows[0].n);
    if (n >= CUSTOM_LIMIT_PER_DAY) throw new SlotError(`Ai folosit toate cele ${CUSTOM_LIMIT_PER_DAY} bilete custom de azi. Revino mâine.`, 429);
    const slot = `CUSTOM_${n + 1}`;
    const ins = await c.query(
      `INSERT INTO ticket_generation_jobs (user_id, slot, period_key, target_odds, required_legs, seed, config, checkpoint, status, stage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'QUEUED','QUEUED') RETURNING id`,
      [userId, slot, key, custom.target, custom.legs, seed, JSON.stringify(cfg), JSON.stringify(checkpoint)],
    );
    const jobId = ins.rows[0].id as string;
    const names = VOTING_AGENTS.filter((a) => custom.agents.includes(a.id)).map((a) => a.name);
    await recordEvent(jobId, { type: 'JOB_CREATED', stage: 'QUEUED', payload: { slot, title: `CUSTOM — COTĂ ${custom.target}`, period: key, authorizedBy: 'click CREEAZĂ BILETUL CUSTOM', custom: { ...custom, names } } }, c);
    await recordEvent(jobId, { type: 'TARGET_SELECTED', stage: 'QUEUED', payload: { target: custom.target, requiredLegs: custom.legs, tolerance: config.limits.targetTolerance, window: cfg, policy } }, c);
    await recordEvent(jobId, { type: 'SEED_GENERATED', stage: 'QUEUED', payload: { seedPrefix: seed.slice(0, 12), note: 'Seed generat pe server; determină doar ordinea de explorare a meciurilor.' } }, c);
    await c.query("INSERT INTO audit_logs(user_id, action, detail) VALUES ($1,'job_created',$2)", [userId, JSON.stringify({ jobId, slot, period: key, custom })]);
    return jobId;
  });
  kickWorker();
  return { jobId: id, created: true };
}

/** Custom jobs of the last days, newest first (with their ticket, if built). */
export async function customJobs(userId: string, limit = 20) {
  return many<{ id: string; slot: string; period_key: string; status: string; stage: string; target_odds: string; required_legs: number; config: { custom?: CustomConfig }; created_at: Date; ticket_id: string | null; generation_status: string | null; actual_odds: string | null; outcome_status: string | null }>(
    `SELECT j.id, j.slot, to_char(j.period_key,'YYYY-MM-DD') AS period_key, j.status, j.stage, j.target_odds, j.required_legs, j.config, j.created_at,
            t.id AS ticket_id, t.generation_status, t.actual_odds, t.outcome_status
     FROM ticket_generation_jobs j LEFT JOIN tickets t ON t.job_id=j.id
     WHERE j.user_id=$1 AND j.slot LIKE 'CUSTOM\\_%' ORDER BY j.created_at DESC LIMIT $2`, [userId, limit]);
}

/** "Vino cu biletul tău": validates the user's own ticket against live prices and queues it for the agents. */
export async function createReviewJob(userId: string, input: unknown, at = new Date()) {
  const o = (input ?? {}) as { legs?: unknown; advice?: unknown };
  const raw = Array.isArray(o.legs) ? o.legs : [];
  const picks = raw.map((x) => ({ fixtureId: String((x as Record<string, unknown>)?.fixtureId ?? ''), marketKey: String((x as Record<string, unknown>)?.marketKey ?? '') })).filter((x) => x.fixtureId && x.marketKey);
  if (!picks.length) throw new SlotError('Adaugă cel puțin un meci pe bilet.');
  if (picks.length > 15) throw new SlotError('Maximum 15 meciuri pe bilet.');
  if (new Set(picks.map((p) => p.fixtureId)).size !== picks.length) throw new SlotError('Un meci poate apărea o singură dată pe bilet.');
  if (picks.some((p) => isBannedMarket(p.marketKey))) throw new SlotError('Pronosticurile „sub” nu sunt analizate în PRIMUL 11.');
  const advice = typeof o.advice === 'string' && o.advice.trim() ? o.advice.trim().slice(0, 800) : null;
  if (!providerConfigured('groq') && !providerConfigured('gemini') && !providerConfigured('openrouter') && !config.allowDemoProviders) throw new SlotError('Niciun furnizor AI nu este configurat pe server.', 503);
  const usage = await aiUsageToday();
  if (usage.requests + 20 > config.limits.aiDailyCalls) throw new SlotError(`Cota AI zilnică este aproape epuizată (${usage.requests}/${config.limits.aiDailyCalls} apeluri).`, 503);
  const key = localDate(at);
  const { fixtures } = await loadFixtures(key, 7, { top10Only: false });
  const legs: ReviewLeg[] = [];
  for (const p of picks) {
    const f = fixtures.find((x) => x.id === p.fixtureId);
    if (!f) throw new SlotError('Un meci de pe bilet nu mai apare la sursă. Reîncarcă lista.', 409);
    const match = `${f.home} – ${f.away}`;
    if (f.status !== 'pre' || Date.parse(f.kickoff) < Date.now() + 20 * 60_000) throw new SlotError(`${match} a început sau începe în mai puțin de 20 de minute.`, 409);
    const full = await withExtraMarkets(f).catch(() => f);
    const m = full.odds?.markets.find((x) => x.key === p.marketKey);
    if (!m) throw new SlotError(`Pronosticul ales pentru ${match} nu mai este listat. Alege din nou.`, 409);
    legs.push({ fixtureId: f.id, marketKey: m.key, label: m.label, odds: m.odds, match, league: `${f.country} · ${f.leagueName}`, kickoff: f.kickoff });
  }
  const target = Math.min(99999, Math.round(legs.reduce((x, l) => x * l.odds, 1) * 100) / 100);
  const cfg = { windowStart: key, windowDays: 7, top10Only: false, maxFixtures: legs.length, batchSize: config.limits.batchSize, avoidFixtures: [] as string[], review: { legs, advice } };
  const seed = randomBytes(16).toString('hex');
  const checkpoint: Checkpoint = { phase: 'DISCOVER', batchIndex: 0, batchStep: 'FETCH', batches: [], agentsDone: [], analyzed: 0, qualified: 0 };
  const id = await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`review:${userId}:${key}`]);
    const n = Number((await c.query("SELECT count(*) AS n FROM ticket_generation_jobs WHERE user_id=$1 AND period_key=$2 AND slot LIKE 'REVIEW\\_%'", [userId, key])).rows[0].n);
    if (n >= REVIEW_LIMIT_PER_DAY) throw new SlotError(`Ai trimis deja ${REVIEW_LIMIT_PER_DAY} bilete la analiză azi. Revino mâine.`, 429);
    const slot = `REVIEW_${n + 1}`;
    const ins = await c.query(
      `INSERT INTO ticket_generation_jobs (user_id, slot, period_key, target_odds, required_legs, seed, config, checkpoint, status, stage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'QUEUED','QUEUED') RETURNING id`,
      [userId, slot, key, target, legs.length, seed, JSON.stringify(cfg), JSON.stringify(checkpoint)],
    );
    const jobId = ins.rows[0].id as string;
    await recordEvent(jobId, { type: 'JOB_CREATED', stage: 'QUEUED', payload: { slot, title: `BILETUL TĂU — COTĂ ${target}`, period: key, authorizedBy: 'click TRIMITE LA ANALIZĂ', review: { legs: legs.map((l) => ({ match: l.match, label: l.label, odds: l.odds })), advice } } }, c);
    await recordEvent(jobId, { type: 'TARGET_SELECTED', stage: 'QUEUED', payload: { target, requiredLegs: legs.length, tolerance: 0, window: { windowStart: key, windowDays: 7 } } }, c);
    await c.query("INSERT INTO audit_logs(user_id, action, detail) VALUES ($1,'job_created',$2)", [userId, JSON.stringify({ jobId, slot, period: key, legs: legs.length })]);
    return jobId;
  });
  kickWorker();
  return { jobId: id, created: true };
}

/** The user's reviewed tickets, newest first. */
export async function reviewJobs(userId: string, limit = 12) {
  return many<{ id: string; status: string; target_odds: string; required_legs: number; created_at: Date; ticket_id: string | null; outcome_status: string | null; summary: { review?: { solid: number; risky: number; weak: number } } | null }>(
    `SELECT j.id, j.status, j.target_odds, j.required_legs, j.created_at, t.id AS ticket_id, t.outcome_status, t.summary
     FROM ticket_generation_jobs j LEFT JOIN tickets t ON t.job_id=j.id
     WHERE j.user_id=$1 AND j.slot LIKE 'REVIEW\\_%' ORDER BY j.created_at DESC LIMIT $2`, [userId, limit]);
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

/** The work queue: analyses waiting or running now, plus the ones finished in the last 2 hours. */
export async function jobQueue(userId: string) {
  const rows = await many<{ id: string; slot: string; status: string; stage: string; target_odds: string; required_legs: number | null; config: { custom?: CustomConfig }; checkpoint: { batches?: string[][]; batchIndex?: number; analyzed?: number; qualified?: number }; created_at: Date; started_at: Date | null; finished_at: Date | null; next_run_at: Date; last_error: string | null; ticket_id: string | null; actual_odds: string | null; generation_status: string | null }>(
    `SELECT j.id, j.slot, j.status, j.stage, j.target_odds, j.required_legs, j.config, j.checkpoint, j.created_at, j.started_at, j.finished_at, j.next_run_at, j.last_error,
            t.id AS ticket_id, t.actual_odds, t.generation_status
     FROM ticket_generation_jobs j LEFT JOIN tickets t ON t.job_id=j.id
     WHERE j.user_id=$1 AND (j.status IN ('QUEUED','RUNNING','WAITING','PAUSED') OR j.finished_at > now() - interval '2 hours')
     ORDER BY CASE WHEN j.status IN ('QUEUED','RUNNING','WAITING','PAUSED') THEN 0 ELSE 1 END, j.created_at DESC LIMIT 20`, [userId]);
  const waiting = rows.filter((r) => r.status === 'QUEUED').sort((a, b) => +a.created_at - +b.created_at).map((r) => r.id);
  return rows.map((r) => {
    const info = slotInfo(r.slot, Number(r.target_odds), r.required_legs);
    const batches = r.checkpoint.batches?.length ?? 0;
    return {
      id: r.id, slot: r.slot, title: info.title, status: r.status, stage: r.stage, createdAt: r.created_at.toISOString(),
      startedAt: r.started_at?.toISOString() ?? null, finishedAt: r.finished_at?.toISOString() ?? null, nextRunAt: r.next_run_at.toISOString(), lastError: r.last_error,
      batch: Math.min(batches, (r.checkpoint.batchIndex ?? 0) + (r.status === 'COMPLETED' ? 0 : 1)), batches, analyzed: r.checkpoint.analyzed ?? 0, qualified: r.checkpoint.qualified ?? 0,
      agents: r.config.custom?.agents ?? null, custom: isCustomSlot(r.slot), review: isReviewSlot(r.slot), position: r.status === 'QUEUED' ? waiting.indexOf(r.id) + 1 : null,
      ticketId: r.ticket_id, actualOdds: r.actual_odds ? Number(r.actual_odds) : null, generation: r.generation_status,
    };
  });
}
export type QueueItem = Awaited<ReturnType<typeof jobQueue>>[number];
