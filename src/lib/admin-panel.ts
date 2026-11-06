import { many, query, SQL_AGO, SQL_NOW, dialect, timeCompare } from './db';
import { config } from './config';
import { adjustCredits, refundJob } from './credits';

/** Everything the admin panel shows, in portable SQL (Cloudflare D1 in production, Postgres elsewhere). */
const ACTIVE = "('QUEUED','RUNNING','WAITING','PAUSED')";

export async function adminQueue() {
  const rows = await many<{ id: string; user_id: string; email: string; slot: string; status: string; stage: string; target_odds: string; required_legs: number | null; created_at: Date; started_at: Date | null; next_run_at: Date; checkpoint: { batches?: string[][]; batchIndex?: number; analyzed?: number } }>(
    `SELECT j.id, j.user_id, u.email, j.slot, j.status, j.stage, j.target_odds, j.required_legs, j.created_at, j.started_at, j.next_run_at, j.checkpoint
     FROM ticket_generation_jobs j JOIN users u ON u.id=j.user_id WHERE j.status IN ${ACTIVE} ORDER BY (j.started_at IS NULL), j.created_at LIMIT 300`);
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, email: r.email, slot: r.slot, status: r.status, stage: r.stage, target: Number(r.target_odds), legs: r.required_legs,
    createdAt: new Date(r.created_at).toISOString(), startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
    batch: Math.min(r.checkpoint?.batches?.length ?? 0, (r.checkpoint?.batchIndex ?? 0) + 1), batches: r.checkpoint?.batches?.length ?? 0, analyzed: r.checkpoint?.analyzed ?? 0,
  }));
}

export async function adminAccounts() {
  return many<{ id: string; email: string; name: string | null; role: string; blocked_at: Date | null; last_login_at: Date | null; balance: number | null; founder: number | null }>(
    `SELECT u.id, u.email, u.name, u.role, u.blocked_at, u.last_login_at, c.balance, c.founder
     FROM users u LEFT JOIN user_credits c ON c.user_id=u.id
     WHERE u.google_sub NOT LIKE 'invite:%' AND u.google_sub <> 'owner:primary' AND u.email NOT LIKE '%@visitor.primul11.local'
     ORDER BY u.last_login_at DESC NULLS LAST LIMIT 300`);
}

export async function adminUsage() {
  const days = await many<{ provider: string; day: string; requests: number; tokens: number; errors: number }>(
    `SELECT provider, ${dialect("to_char(day,'YYYY-MM-DD')", 'day')} AS day, requests, tokens, errors FROM provider_usage WHERE day > ${dialect('current_date-3', "date('now','-3 days')")} ORDER BY day DESC, provider`);
  return { days, limits: { calls: config.limits.aiDailyCalls, tokens: config.limits.aiDailyTokens, concurrent: config.limits.maxConcurrentJobs } };
}

export async function adminPayments() {
  const recent = await many<{ id: number; email: string; delta: number; reason: string; ref: string; created_at: Date }>(
    `SELECT l.id, u.email, l.delta, l.reason, l.ref, l.created_at FROM credit_ledger l JOIN users u ON u.id=l.user_id
     WHERE l.reason IN ('purchase','charge','refund','grant','admin') ORDER BY l.id DESC LIMIT 60`);
  const day = await many<{ reason: string; credits: number; n: number }>(
    `SELECT reason, CAST(sum(delta) AS INTEGER) AS credits, CAST(count(*) AS INTEGER) AS n FROM credit_ledger WHERE ${timeCompare('created_at', '>', SQL_AGO(24, 'hours'))} AND reason IN ('purchase','charge','refund') GROUP BY reason`);
  return { recent: recent.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() })), day };
}

/** Stops waiting/running analyses (one job, or all of a user's) and gives their credits back when they were charged. */
export async function cancelJobs(target: { jobId?: string; userId?: string }) {
  const rows = await many<{ id: string; user_id: string; config: { custom?: { legs: number }; customBatch?: { id: string } } }>(
    `SELECT id, user_id, config FROM ticket_generation_jobs WHERE status IN ${ACTIVE} AND ${target.jobId ? 'id=$1' : 'user_id=$1'}`, [target.jobId ?? target.userId]);
  for (const r of rows) {
    await query(`UPDATE ticket_generation_jobs SET status='FAILED', lease_owner=NULL, lease_expires_at=NULL, finished_at=${SQL_NOW()}, last_error='Anulat de administrator' WHERE id=$1 AND status IN ${ACTIVE}`, [r.id]);
    await refundJob(r).catch(() => undefined);
  }
  return rows.length;
}

export { adjustCredits };
