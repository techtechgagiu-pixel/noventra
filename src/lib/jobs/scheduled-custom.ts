import { createHash } from 'node:crypto';
import { many, one, query } from '../db';
import { customLimitForUser } from '../credits';
import { createCustomJob, SlotError } from './service';

const ZONE = 'Europe/Bucharest';
function localNow(at: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}
/** The same request id for the same order and day, so a retried pass never queues the batch twice. */
export function scheduledRequestId(orderId: string, day: string) {
  const h = createHash('sha256').update(`${orderId}:${day}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * 23.11: standing orders („în fiecare zi la 14: 10 bilete cota 2, 3 meciuri, 24 h, toate ligile”). Runs in the
 * Cloudflare cron pass; each order is claimed for the day before it is queued, so overlapping passes cannot double it.
 * The batch goes through createCustomJob, with the same checks, credits and limits as the button in the form.
 */
export async function runScheduledCustom(at = new Date()) {
  const { day, hour } = localNow(at);
  const due = await many<{ id: string; user_id: string; hour: number; settings: string }>(
    'SELECT id, user_id, hour, settings FROM scheduled_custom WHERE enabled=1 AND hour<=$1 AND (last_run_day IS NULL OR last_run_day<>$2)', [hour, day]);
  const results: Array<{ id: string; status: string }> = [];
  for (const order of due) {
    const claimed = await query('UPDATE scheduled_custom SET last_run_day=$2 WHERE id=$1 AND (last_run_day IS NULL OR last_run_day<>$2)', [order.id, day]);
    if (!claimed.rowCount) continue;
    let status: string;
    try {
      const user = await one<{ id: string; email: string; role: string; custom_daily_limit: number | null; blocked_at: string | null }>('SELECT id, email, role, custom_daily_limit, blocked_at FROM users WHERE id=$1', [order.user_id]);
      if (!user || user.blocked_at) throw new SlotError('Contul nu mai este activ.');
      const settings = JSON.parse(order.settings) as Record<string, unknown>;
      const limit = await customLimitForUser({ id: user.id, email: user.email, role: user.role, customDailyLimit: user.custom_daily_limit });
      const r = await createCustomJob(user.id, { ...settings, requestId: scheduledRequestId(order.id, day) }, at, limit);
      status = `queued ${r.jobIds.length} (${r.batchId})`;
    } catch (error) {
      status = `failed: ${(error as Error).message?.slice(0, 200)}`;
    }
    await query('UPDATE scheduled_custom SET last_result=$2 WHERE id=$1', [order.id, JSON.stringify({ day, at: at.toISOString(), status })]);
    console.log(JSON.stringify({ event: 'scheduled_custom', id: order.id, day, status }));
    results.push({ id: order.id, status });
  }
  return results;
}
