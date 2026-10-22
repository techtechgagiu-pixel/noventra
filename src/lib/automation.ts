import { randomUUID } from 'node:crypto';
import { many, one, query } from './db';

/** Database lease prevents overlapping checks during rolling deploys; it expires after a crashed process. */
export async function runAutomation(name: string, work: () => Promise<Record<string, unknown>>) {
  const owner = randomUUID();
  const lease = await one(`INSERT INTO automation_runs(name,started_at,lease_owner,lease_until)
    VALUES ($1,now(),$2,now()+interval '10 minutes') ON CONFLICT(name) DO UPDATE
    SET started_at=now(),lease_owner=$2,lease_until=now()+interval '10 minutes'
    WHERE automation_runs.lease_until IS NULL OR automation_runs.lease_until<now() RETURNING name`, [name, owner]);
  if (!lease) return { status: 'busy' as const };
  const timer = setInterval(() => { void query(`UPDATE automation_runs SET lease_until=now()+interval '10 minutes' WHERE name=$1 AND lease_owner=$2`, [name, owner]).catch(() => {}); }, 60_000);
  timer.unref?.();
  try {
    const detail = await work();
    const error = Number(detail.sourceErrors ?? 0) ? `${detail.sourceErrors} cereri de rezultate au eșuat; se reîncearcă automat.` : null;
    await query(`UPDATE automation_runs SET finished_at=now(),last_success_at=CASE WHEN $3::text IS NULL THEN now() ELSE last_success_at END,last_error=$3,detail=$4,lease_owner=NULL,lease_until=NULL WHERE name=$1 AND lease_owner=$2`, [name, owner, error, JSON.stringify(detail)]);
    console.log(JSON.stringify({ event: `${name}_completed`, ...detail }));
    return { status: error ? 'partial' as const : 'completed' as const, detail };
  } catch (e) {
    // A failed pass is visible to the administrator; it is never advertised as a successful update.
    const message = (e as Error).message.slice(0, 500);
    await query(`UPDATE automation_runs SET finished_at=now(),last_error=$3,lease_owner=NULL,lease_until=NULL WHERE name=$1 AND lease_owner=$2`, [name, owner, message]).catch(() => {});
    console.warn(JSON.stringify({ event: `${name}_failed`, message }));
    return { status: 'failed' as const, error: message };
  } finally { clearInterval(timer); }
}

export async function automationHealth() {
  const [runs, pending, jobs, agents] = await Promise.all([
    many(`SELECT name,started_at,finished_at,last_success_at,last_error,detail,lease_until FROM automation_runs ORDER BY name`),
    one(`SELECT
      (SELECT count(*)::int FROM agent_predictions p JOIN fixtures f ON f.id=p.fixture_id WHERE p.decision='BET_CANDIDATE' AND p.outcome IS NULL AND f.status='post') AS agent_picks_awaiting,
      (SELECT count(*)::int FROM ticket_selections s JOIN fixtures f ON f.id=s.fixture_id WHERE s.outcome='PENDING' AND f.status='post') AS ticket_legs_awaiting,
      (SELECT count(*)::int FROM agent_predictions p LEFT JOIN fixtures f ON f.id=p.fixture_id WHERE f.id IS NULL) AS missing_fixtures,
      (SELECT count(*)::int FROM fixtures f WHERE f.kickoff_utc<now()-interval '3 hours' AND f.status IN ('pre','in') AND
        (EXISTS(SELECT 1 FROM agent_predictions p WHERE p.fixture_id=f.id AND p.decision='BET_CANDIDATE' AND p.outcome IS NULL) OR EXISTS(SELECT 1 FROM ticket_selections s WHERE s.fixture_id=f.id AND s.outcome='PENDING'))) AS overdue_fixtures`),
    many(`SELECT status,count(*)::int AS n,min(next_run_at) AS next_run_at FROM ticket_generation_jobs WHERE status IN ('QUEUED','WAITING','RUNNING','PAUSED') GROUP BY status`),
    many(`SELECT agent_id,count(*)::int AS calls,count(*) FILTER(WHERE ok)::int AS successful,count(*) FILTER(WHERE NOT ok)::int AS failed,max(created_at) AS last_call,
       (array_agg(error ORDER BY created_at DESC) FILTER(WHERE NOT ok))[1] AS last_error
       FROM model_usage_logs WHERE agent_id IS NOT NULL GROUP BY agent_id ORDER BY agent_id`),
  ]);
  return { checkedAt: new Date().toISOString(), intervalSeconds: 300, runs, pending, jobs, agents,
    execution: process.env.BETMIND_DISABLE_WORKER === '1' ? 'disabled' : 'in_process',
    hosting: process.env.RENDER_SERVICE_ID ? 'render' : 'local',
    note: 'Verificările rulează cât procesul este activ și la repornire. Render Free poate adormi; nu garantează execuție continuă.' };
}
