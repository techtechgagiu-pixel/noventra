import { randomUUID } from 'node:crypto';
import { config } from '../config';
import { one, query } from '../db';
import { BudgetExceededError, RateLimitError } from '../ai/router';
import { QuotaExceededError } from '../sports/http';
import { recordEvent } from './events';
import { runJobSlice, type JobRow } from './pipeline';

const WORKER_ID = `${process.env.RENDER_INSTANCE_ID || 'local'}:${randomUUID().slice(0, 8)}`;
const LEASE_MS = 3 * 60_000;
const g = globalThis as unknown as { __betmindWorker?: { running: number; timer: NodeJS.Timeout | null; started: boolean } };
const state = (g.__betmindWorker ??= { running: 0, timer: null, started: false });

/** Atomically claims one runnable job (expired leases are reclaimed after a restart). */
async function claim(): Promise<(JobRow & { recovered: boolean }) | null> {
  return one<JobRow & { recovered: boolean }>(
    `WITH picked AS (
       SELECT id, (status = 'RUNNING') AS recovered FROM ticket_generation_jobs
       WHERE ((status IN ('QUEUED','WAITING') AND next_run_at <= now()) OR (status='RUNNING' AND (lease_expires_at IS NULL OR lease_expires_at < now())))
       ORDER BY next_run_at LIMIT 1 FOR UPDATE SKIP LOCKED)
     UPDATE ticket_generation_jobs j SET lease_owner=$1, lease_expires_at=now() + ($2 || ' milliseconds')::interval, status='RUNNING', started_at=COALESCE(started_at, now())
     FROM picked WHERE j.id = picked.id
     RETURNING j.id, j.user_id, j.slot, to_char(j.period_key,'YYYY-MM-DD') AS period_key, j.target_odds, j.required_legs, j.seed, j.config, j.status, j.stage, j.checkpoint, j.candidate_order, j.eligible_count, j.attempt_count, picked.recovered`,
    [WORKER_ID, String(LEASE_MS)],
  );
}

async function wasInterrupted(jobId: string) {
  const r = await one<{ type: string }>('SELECT type FROM analysis_events WHERE job_id=$1 ORDER BY seq DESC LIMIT 1', [jobId]);
  return r && !['JOB_CREATED', 'TARGET_SELECTED', 'SEED_GENERATED', 'JOB_RESUMED', 'JOB_WAITING'].includes(r.type);
}

async function processOne(): Promise<boolean> {
  const job = await claim();
  if (!job) return false;
  const tick = setInterval(() => { void query("UPDATE ticket_generation_jobs SET lease_expires_at=now() + interval '3 minutes' WHERE id=$1 AND lease_owner=$2", [job.id, WORKER_ID]); }, 60_000);
  try {
    if (job.recovered && job.stage !== 'QUEUED' && (await wasInterrupted(job.id))) {
      await recordEvent(job.id, { type: 'JOB_RESUMED', stage: job.stage, payload: { by: 'system', note: 'Execuția a fost reluată din ultimul checkpoint salvat (serviciul a fost repornit sau a fost inactiv). Între timp nu s-a procesat nimic.' } });
    }
    const outcome = await runJobSlice(job);
    if (outcome === 'CONTINUE') await query("UPDATE ticket_generation_jobs SET status='QUEUED', next_run_at=now(), lease_owner=NULL, lease_expires_at=NULL WHERE id=$1", [job.id]);
  } catch (error) {
    await handleError(job, error as Error);
  } finally {
    clearInterval(tick);
  }
  return true;
}

async function handleError(job: JobRow, error: Error) {
  const msg = error.message.slice(0, 500);
  console.error(JSON.stringify({ event: 'job_error', jobId: job.id, stage: job.stage, message: msg }));
  if (error instanceof RateLimitError && !error.daily) {
    const waitMs = Math.min(Math.max(error.retryAfterMs, 5_000), 15 * 60_000);
    await query("UPDATE ticket_generation_jobs SET status='WAITING', next_run_at=now() + ($2 || ' milliseconds')::interval, last_error=$3, lease_owner=NULL, lease_expires_at=NULL WHERE id=$1", [job.id, String(waitMs), msg]);
    await recordEvent(job.id, { type: 'JOB_WAITING', stage: job.stage, payload: { reason: msg, provider: error.provider, retryInSeconds: Math.ceil(waitMs / 1000) } });
    return;
  }
  if (error instanceof RateLimitError || error instanceof BudgetExceededError || error instanceof QuotaExceededError) {
    // Daily quota: pause explicitly. The same job continues after the user presses CONTINUĂ ANALIZA.
    await query("UPDATE ticket_generation_jobs SET status='PAUSED', last_error=$2, lease_owner=NULL, lease_expires_at=NULL WHERE id=$1", [job.id, msg]);
    await recordEvent(job.id, { type: 'JOB_PAUSED', stage: job.stage, payload: { reason: msg, recoverable: true } });
    return;
  }
  const attempts = job.attempt_count + 1;
  if (attempts < 4) {
    const backoff = 15_000 * 2 ** (attempts - 1);
    await query("UPDATE ticket_generation_jobs SET status='WAITING', attempt_count=$2, next_run_at=now() + ($3 || ' milliseconds')::interval, last_error=$4, lease_owner=NULL, lease_expires_at=NULL WHERE id=$1", [job.id, attempts, String(backoff), msg]);
    await recordEvent(job.id, { type: 'JOB_WAITING', stage: job.stage, payload: { reason: msg, attempt: attempts, retryInSeconds: backoff / 1000 } });
  } else {
    await query("UPDATE ticket_generation_jobs SET status='PAUSED', attempt_count=$2, last_error=$3, lease_owner=NULL, lease_expires_at=NULL WHERE id=$1", [job.id, attempts, msg]);
    await recordEvent(job.id, { type: 'JOB_PAUSED', stage: job.stage, payload: { reason: msg, attempts, recoverable: true } });
  }
}

async function loop() {
  if (state.running >= config.limits.maxConcurrentJobs) return;
  state.running++;
  try {
    while (await processOne()) { /* drain runnable jobs */ }
  } catch (error) {
    console.error(JSON.stringify({ event: 'worker_loop_error', message: (error as Error).message }));
  } finally {
    state.running--;
  }
}

/** Wakes the in-process worker (called after a job is created or resumed). */
export function kickWorker() {
  if (process.env.BETMIND_DISABLE_WORKER === '1') return;
  for (let i = state.running; i < config.limits.maxConcurrentJobs; i++) void loop();
}

/** Starts a periodic scan. Runs only while the web service is awake (Render Free sleeps when idle). */
export function startWorker() {
  if (state.started || process.env.BETMIND_DISABLE_WORKER === '1') return;
  state.started = true;
  state.timer = setInterval(kickWorker, 5_000);
  kickWorker();
  console.log(JSON.stringify({ event: 'worker_started', worker: WORKER_ID }));
}

export const workerId = WORKER_ID;
export { processOne as _processOneForTests };
