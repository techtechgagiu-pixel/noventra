import { randomUUID } from 'node:crypto';
import { many, one, query, dialect, isD1, SQL_NOW, SQL_AGO, timeCompare } from './db';

/** Database lease prevents overlapping checks during rolling deploys; it expires after a crashed process. */
export async function runAutomation(name: string, work: () => Promise<Record<string, unknown>>) {
  const owner = randomUUID();
  const until = dialect("now()+interval '10 minutes'", "strftime('%Y-%m-%dT%H:%M:%fZ','now','+10 minutes')");
  const lease = await one(`INSERT INTO automation_runs(name,started_at,lease_owner,lease_until)
    VALUES ($1,${SQL_NOW()},$2,${until}) ON CONFLICT(name) DO UPDATE
    SET started_at=${SQL_NOW()},lease_owner=$2,lease_until=${until}
    WHERE automation_runs.lease_until IS NULL OR ${timeCompare('automation_runs.lease_until','<',SQL_NOW())} RETURNING name`, [name, owner]);
  if (!lease) return { status: 'busy' as const };
  const timer = isD1() ? null : setInterval(() => { void query(`UPDATE automation_runs SET lease_until=now()+interval '10 minutes' WHERE name=$1 AND lease_owner=$2`, [name, owner]).catch(() => {}); }, 60_000);
  timer?.unref?.();
  try {
    const detail = await work();
    const error = Number(detail.sourceErrors ?? 0) ? `${detail.sourceErrors} cereri de rezultate au eșuat; se reîncearcă automat.` : null;
    await query(`UPDATE automation_runs SET finished_at=${SQL_NOW()},last_success_at=CASE WHEN ${dialect('$3::text','$3')} IS NULL THEN ${SQL_NOW()} ELSE last_success_at END,last_error=$3,detail=$4,lease_owner=NULL,lease_until=NULL WHERE name=$1 AND lease_owner=$2`, [name, owner, error, JSON.stringify(detail)]);
    console.log(JSON.stringify({ event: `${name}_completed`, ...detail }));
    return { status: error ? 'partial' as const : 'completed' as const, detail };
  } catch (e) {
    // A failed pass is visible to the administrator; it is never advertised as a successful update.
    const message = (e as Error).message.slice(0, 500);
    await query(`UPDATE automation_runs SET finished_at=${SQL_NOW()},last_error=$3,lease_owner=NULL,lease_until=NULL WHERE name=$1 AND lease_owner=$2`, [name, owner, message]).catch(() => {});
    console.warn(JSON.stringify({ event: `${name}_failed`, message }));
    return { status: 'failed' as const, error: message };
  } finally { if (timer) clearInterval(timer); }
}

export async function automationHealth() {
  const [runs, pending, jobs, agents] = await Promise.all([
    many(`SELECT name,started_at,finished_at,last_success_at,last_error,detail,lease_until FROM automation_runs ORDER BY name`),
    one(`SELECT
      (SELECT CAST(count(*) AS INTEGER) FROM agent_predictions p JOIN fixtures f ON f.id=p.fixture_id WHERE p.decision='BET_CANDIDATE' AND p.outcome IS NULL AND f.status='post') AS agent_picks_awaiting,
      (SELECT CAST(count(*) AS INTEGER) FROM ticket_selections s JOIN fixtures f ON f.id=s.fixture_id WHERE s.outcome='PENDING' AND f.status='post') AS ticket_legs_awaiting,
      (SELECT CAST(count(*) AS INTEGER) FROM agent_predictions p LEFT JOIN fixtures f ON f.id=p.fixture_id WHERE f.id IS NULL) AS missing_fixtures,
      (SELECT CAST(count(*) AS INTEGER) FROM fixtures f WHERE ${timeCompare('f.kickoff_utc','<',SQL_AGO(3,'hours'))} AND f.status IN ('pre','in') AND
        (EXISTS(SELECT 1 FROM agent_predictions p WHERE p.fixture_id=f.id AND p.decision='BET_CANDIDATE' AND p.outcome IS NULL) OR EXISTS(SELECT 1 FROM ticket_selections s WHERE s.fixture_id=f.id AND s.outcome='PENDING'))) AS overdue_fixtures`),
    many(`SELECT status,CAST(count(*) AS INTEGER) AS n,min(next_run_at) AS next_run_at FROM ticket_generation_jobs WHERE status IN ('QUEUED','WAITING','RUNNING','PAUSED') GROUP BY status`),
    many(`SELECT l.agent_id,CAST(count(*) AS INTEGER) AS calls,CAST(count(*) FILTER(WHERE ok) AS INTEGER) AS successful,CAST(count(*) FILTER(WHERE NOT ok) AS INTEGER) AS failed,max(created_at) AS last_call,
       (SELECT error FROM model_usage_logs e WHERE e.agent_id=l.agent_id AND NOT e.ok ORDER BY e.created_at DESC LIMIT 1) AS last_error
       FROM model_usage_logs l WHERE l.agent_id IS NOT NULL GROUP BY l.agent_id ORDER BY l.agent_id`),
  ]);
  return { checkedAt: new Date().toISOString(), intervalSeconds: 300, runs, pending, jobs, agents,
    execution: isD1() ? 'cloudflare_scheduled' : process.env.BETMIND_DISABLE_WORKER === '1' ? 'disabled' : 'in_process',
    hosting: isD1() ? 'cloudflare' : process.env.RENDER_SERVICE_ID ? 'render' : 'local',
    note: isD1() ? 'Verificările sunt declanșate de programarea Cloudflare; ultima execuție și eventualele erori apar mai sus.' : 'Verificările rulează cât procesul este activ și la repornire. Render Free poate adormi; nu garantează execuție continuă.' };
}
