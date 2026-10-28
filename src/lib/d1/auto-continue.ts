import { many, one, SQL_NOW } from '../db';
import { localDate } from '../time';
import { transitionD1Job } from './job-mutations';

/**
 * Finishes tickets without the user on the site (user decision 27.10: "să se finalizeze, nu să rămână incomplete").
 * Runs from the 5-minute Cloudflare cron, before the runner is woken:
 *  1. a job paused by the daily AI cap continues once the cap has reset (next UTC day); a job paused by repeated
 *     errors continues after a 20-minute pause — at most MAX_AUTO_RESUMES times per job;
 *  2. an incomplete custom ticket from the last 48 h is sent to "Finalizează biletul" automatically (same target, same
 *     team, new fixtures), at most MAX_COMPLETIONS attempts per ticket, one new start per pass, never two at once.
 * Only state transitions are written here; the AI work itself still runs on the runner within the same daily cap.
 */
export const MAX_AUTO_RESUMES = 24; // "never stuck unless there is no money": quota pauses keep resuming for 3 days
export const MAX_COMPLETIONS = 3;
const QUOTA = /cota zilnic|plafon|buget|budget|epuizat|limita ai zilnic|limita zilnică de cereri|limita pentru azi|credite/i;
const RESERVE_COUNT = 7; // free reserve models (router.RESERVE_MODELS)

type Row = { id: string; user_id: string; config: string | Record<string, unknown>; last_error: string | null; updated_at: string; last_event_seq: number };
const parse = (c: Row['config']) => (typeof c === 'string' ? JSON.parse(c) : c) as Record<string, unknown> & { completion?: { attempt?: number; requestedAt?: string }; autoResumes?: number; review?: unknown };

export async function autoContinueJobs(now = new Date()) {
  const result = { resumed: 0, completed: 0 };
  const dayStart = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const paused = await many<Row>(`SELECT id,user_id,config,last_error,updated_at,last_event_seq FROM ticket_generation_jobs
    WHERE status='PAUSED' AND julianday(created_at)>julianday('now','-3 days') ORDER BY updated_at LIMIT 10`);
  // Is any model usable now? OpenRouter (credits back) or at least one free reserve whose daily quota has reset.
  const blocked = paused.length ? await many<{ model_key: string }>("SELECT model_key FROM model_health WHERE julianday(exhausted_until)>julianday('now')").catch(() => []) : [];
  const openRouterOk = !blocked.some((b) => b.model_key === 'openrouter:*');
  const reservesOk = blocked.filter((b) => /^(gemini|groq):/.test(b.model_key)).length < RESERVE_COUNT;
  const modelsAvailable = openRouterOk || reservesOk;
  for (const j of paused) {
    const cfg = parse(j.config);
    const count = cfg.autoResumes ?? 0;
    if (count >= MAX_AUTO_RESUMES) continue;
    const quota = QUOTA.test(j.last_error ?? '');
    const quiet = Date.now() - Date.parse(j.updated_at);
    // Quota pauses: after the daily reset, or as soon as some model is free again (checked at most every 30 min).
    const ready = quota ? (Date.parse(j.updated_at) < Date.parse(dayStart) && modelsAvailable) || (quiet > 30 * 60_000 && modelsAvailable) : quiet > 20 * 60_000;
    if (!ready) continue;
    const ok = await transitionD1Job({
      text: `UPDATE ticket_generation_jobs SET status='QUEUED',next_run_at=${SQL_NOW()},attempt_count=0,last_error=NULL,lease_owner=NULL,lease_expires_at=NULL,config=$3,last_event_seq=last_event_seq+1
        WHERE id=$1 AND status='PAUSED' AND last_event_seq=$2 RETURNING id`,
      params: [j.id, j.last_event_seq, JSON.stringify({ ...cfg, autoResumes: count + 1 })],
    }, j.id, { type: 'JOB_RESUMED', stage: 'QUEUED', payload: { by: 'automat', note: quota ? 'Modelele AI sunt din nou disponibile: analiza continuă automat de unde a rămas.' : 'Analiza continuă automat după o pauză.' } }).catch(() => null);
    if (ok) result.resumed++;
  }

  // One new completion per pass, and only while nothing else is waiting for the runner (keeps the daily cap for users).
  const busy = await one<{ n: number }>("SELECT count(*) AS n FROM ticket_generation_jobs WHERE status IN ('QUEUED','RUNNING','WAITING')");
  if ((busy?.n ?? 0) >= 2) return result;
  const incomplete = await many<Row & { ticket_id: string }>(`SELECT j.id,j.user_id,j.config,j.last_error,j.updated_at,j.last_event_seq,t.id AS ticket_id
    FROM tickets t JOIN ticket_generation_jobs j ON j.id=t.job_id
    WHERE t.generation_status='INCOMPLETE' AND j.status='INCOMPLETE' AND substr(j.slot,1,7)<>'REVIEW_'
      AND julianday(t.created_at)>julianday('now','-2 days') AND julianday(COALESCE(j.finished_at,j.updated_at))<julianday('now','-30 minutes')
    ORDER BY j.finished_at LIMIT 10`);
  for (const j of incomplete) {
    const cfg = parse(j.config);
    if (cfg.review) continue;
    const attempt = (cfg.completion?.attempt ?? 0) + 1;
    if (attempt > MAX_COMPLETIONS) continue;
    const next = { ...cfg, windowStart: localDate(now), completion: { requestedAt: now.toISOString(), attempt, auto: true } };
    const checkpoint = await one<{ checkpoint: string | Record<string, unknown> }>('SELECT checkpoint FROM ticket_generation_jobs WHERE id=$1', [j.id]);
    const prev = checkpoint ? (typeof checkpoint.checkpoint === 'string' ? JSON.parse(checkpoint.checkpoint) : checkpoint.checkpoint) : {};
    const cp = { ...prev, phase: 'DISCOVER', batchIndex: 0, batchStep: 'FETCH', batches: [], agentsDone: [] };
    const ok = await transitionD1Job({
      text: `UPDATE ticket_generation_jobs SET status='QUEUED',stage='QUEUED',config=$3,checkpoint=$4,next_run_at=${SQL_NOW()},finished_at=NULL,started_at=NULL,last_error=NULL,attempt_count=0,lease_owner=NULL,lease_expires_at=NULL,last_event_seq=last_event_seq+1
        WHERE id=$1 AND status='INCOMPLETE' AND last_event_seq=$2 RETURNING id`,
      params: [j.id, j.last_event_seq, JSON.stringify(next), JSON.stringify(cp)],
    }, j.id, { type: 'JOB_RESUMED', stage: 'QUEUED', payload: { by: 'automat', completion: true, attempt, note: 'Finalizare automată a biletului incomplet: păstrăm analiza salvată, reverificăm selecțiile și căutăm meciuri noi cu aceeași țintă și echipă.' } },
    { userId: j.user_id, action: 'ticket_completion_auto', detail: { ticketId: j.ticket_id, jobId: j.id, attempt } }).catch(() => null);
    if (ok) { result.completed++; break; }
  }
  return result;
}
