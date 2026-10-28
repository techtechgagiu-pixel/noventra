import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { d1Database, sqliteParameters, decodeRow } from '@/lib/d1/client';
import { splitSqlScript } from '@/lib/d1/sql-script';
import { withDatabase, atomic, query, one, tx } from '@/lib/db';
import { issueInvitation, loginWithCode, userFromToken, createSession } from '@/lib/auth';
import { agentStats } from '@/lib/agent-stats';
import { agentTrackRecord, allTrackRecords } from '@/lib/track-record';
import { config } from '@/lib/config';
import { listTickets, ticketDetail, jobMeta } from '@/lib/views';
import { recordEvent, eventsAfter } from '@/lib/jobs/events';
import { settlePending } from '@/lib/settlement';
import { automationHealth, runAutomation } from '@/lib/automation';
import { createCustomJob, customBatchJobs, resumeJob, completeIncompleteTicket } from '@/lib/jobs/service';
import { runJobSlice, type JobRow } from '@/lib/jobs/pipeline';
import { installFakes, demoFixtures } from '@/lib/testing/fakes';
import { setAiTransportForTests } from '@/lib/ai/router';
import { setFixtureProviderForTests } from '@/lib/sports/fixtures';
import { setHistoryProviderForTests } from '@/lib/scout/history';
import { reservePaidCall, recordPaidCall } from '@/lib/d1/ai-budget';
import { randomUUID } from 'node:crypto';
import { autoContinueJobs } from '@/lib/d1/auto-continue';

describe('real D1 runtime (local workerd, no provider calls)', () => {
  let mf: Miniflare;
  let db: ReturnType<typeof d1Database>;
  const scope = <T>(work: () => T) => withDatabase(db, work);
  beforeAll(async () => {
    mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("D1 local test")}}', compatibilityDate: '2026-10-25', d1Databases: ['DB'] }));
    const binding = await mf.getD1Database('DB');
    db = d1Database(binding);
    for (const file of ['0001_legacy_schema.sql', '0002_agent_configuration.sql', '0003_request_coordination.sql', '0004_league_configuration.sql', '0005_worker_bridge.sql','0006_ai_budget.sql','0007_model_identities.sql','0009_feedback.sql','0010_ticket_hidden.sql','0013_perf_indexes.sql','0015_custom_daily_limits.sql']) {
      const statements = splitSqlScript(await readFile('cloudflare/d1/migrations/' + file, 'utf8'));
      for (let i = 0; i < statements.length; i += 20) await binding.batch(statements.slice(i, i + 20).map(s => binding.prepare(s)));
    }
  });
  afterAll(async () => { await mf?.dispose(); });

  it('binds numbered/repeated parameters without altering quoted text', async () => scope(async () => {
    expect(sqliteParameters("SELECT $2, '$1', \"$3\", $1, $2 -- $4\n/* $5 */")).toBe("SELECT ?2, '$1', \"$3\", ?1, ?2 -- $4\n/* $5 */");
    expect(await one('SELECT $2 AS second,$1 AS first,$2 AS again', ['a', 'b'])).toEqual({ second: 'b', first: 'a', again: 'b' });
  }));

  it('rolls back the whole D1 batch on a constraint failure and rejects interactive tx', async () => scope(async () => {
    await expect(atomic([
      { text: "INSERT INTO users(id,google_sub,email) VALUES('rollback-user','rollback','rollback@test.local')" },
      { text: "INSERT INTO sessions(id,user_id,expires_at) VALUES('broken','missing-user','2030-01-01T00:00:00Z')" },
    ])).rejects.toThrow();
    expect(await one("SELECT id FROM users WHERE id='rollback-user'")).toBeNull();
    await expect(tx(async () => undefined)).rejects.toThrow(/Interactive/);
  }));

  it('preserves invitation isolation, exact seven-day validity, revocation and Google roles', async () => scope(async () => {
    const owner = (await one<{ id: string }>("INSERT INTO users(google_sub,email,name,role) VALUES('owner:primary','owner@test.local','Owner','admin') RETURNING id"))!;
    const invite = await issueInvitation(owner.id, 'D1 visitor');
    const saved = (await one<{ created_at: Date; expires_at: Date }>('SELECT created_at,expires_at FROM invitation_codes WHERE id=$1', [invite.id]))!;
    expect(saved.expires_at.getTime() - saved.created_at.getTime()).toBe(7 * 86400_000);
    // Set only the configured admin hash in memory; no provider/real-account login.
    const original = config.ownerAccessCodeHash, demo = config.allowDemoProviders;
    config.ownerAccessCodeHash = 'a'.repeat(64);
    config.allowDemoProviders = false;
    try {
      const login = await loginWithCode(invite.code);
      expect(login).not.toBeNull();
      expect(await userFromToken(login!.token)).toMatchObject({ name: 'D1 visitor', role: 'user', soundEnabled: false });
      await query('UPDATE invitation_codes SET revoked_at=$2 WHERE id=$1', [invite.id, new Date()]);
      expect(await userFromToken(login!.token)).toBeNull();
      const google = await createSession(owner.id, undefined, { google: true });
      expect(await userFromToken(google.token)).toMatchObject({ role: 'user' });
      await query('UPDATE users SET blocked_at=$2 WHERE id=$1', [owner.id, new Date()]);
      expect(await userFromToken(google.token)).toBeNull();
    } finally { config.ownerAccessCodeHash = original; config.allowDemoProviders = demo; }
  }));

  it('keeps final-round/latest-analysis statistics and Romanian month boundaries aligned', async () => scope(async () => {
    const user = (await one<{ id: string }>("INSERT INTO users(google_sub,email) VALUES('stats-d1','stats@test.local') RETURNING id"))!;
    await query("INSERT INTO leagues(id,country,name,provider,provider_key,priority) VALUES('DEMO','DEMO','DEMO','demo','demo',1)");
    await query("INSERT INTO fixtures(id,provider,provider_id,league_id,home_team,away_team,kickoff_utc,status,content_hash) VALUES('demo:d1','demo','d1','DEMO','A','B','2026-10-31T22:30:00Z','post','demo')");
    const makeJob = async (slot: string) => (await one<{ id: string }>("INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config) VALUES($1,$2,'2026-10-25',5,'demo','{}') RETURNING id", [user.id, slot]))!.id;
    const a = await makeJob('CUSTOM_1'), b = await makeJob('CUSTOM_2');
    const { activeAssignments } = await import('@/lib/ai/assignments');
    const model = (await activeAssignments()).get('robert')!.primary.model;
    const pick = (job: string, round: number, decision: string, outcome: string | null, at: string) => query("INSERT INTO agent_predictions(job_id,fixture_id,agent_id,round,provider,model_id,prompt_version,decision,market_key,odds,payload,outcome,created_at) VALUES($1,'demo:d1','robert',$2,'demo',$6,'v1',$3,'1X2:HOME',1.5,'{}',$4,$5)", [job, round, decision, outcome, at, model]);
    await pick(a, 0, 'BET_CANDIDATE', 'WON', '2026-10-20T08:00:00Z');
    await pick(b, 0, 'BET_CANDIDATE', 'WON', '2026-10-21T08:00:00Z');
    await pick(b, 1, 'BET_CANDIDATE', 'LOST', '2026-10-21T09:00:00Z');
    expect((await agentStats(user.id, false, '2026-10')).agents.find(a => a.id === 'robert')).toMatchObject({ bets: 0, career: { won: 0, lost: 0 } });
    expect((await agentStats(user.id, false, '2026-11')).agents.find(a => a.id === 'robert')).toMatchObject({ bets: 1, won: 0, lost: 1 });
    expect(await agentTrackRecord('robert')).toMatchObject({ decided: 1, won: 0 });
    expect((await allTrackRecords(['robert'], { month: '2026-11' }))[0].record).toMatchObject({ decided: 1, won: 0 });
    await pick(b, 2, 'NO_BET', null, '2026-10-21T10:00:00Z');
    (await import('@/lib/decided-picks')).clearDecidedPicks(); // the shared prompt-feedback cache refreshes every 10 min
    expect(await agentTrackRecord('robert')).toBeNull();
  }));

  it('projects incomplete tickets and appends concurrent events with a gap-free sequence', async () => scope(async () => {
    const user = (await one<{ id: string }>("INSERT INTO users(google_sub,email,name) VALUES('archive-d1','archive@test.local','D1 Archive') RETURNING id"))!;
    const job = (await one<{ id: string }>("INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status) VALUES($1,'CUSTOM_1','2026-10-25',50,'demo','{}',$2,'INCOMPLETE') RETURNING id", [user.id, JSON.stringify({ batches: [['demo:d1']], batchIndex: 0, analyzed: 1, qualified: 1 })]))!;
    const ticket = (await one<{ id: string }>("INSERT INTO tickets(job_id,user_id,slot,period_key,target_odds,generation_status,outcome_status,summary) VALUES($1,$2,'CUSTOM_1','2026-10-25',50,'INCOMPLETE','NOT_APPLICABLE','{}') RETURNING id", [job.id,user.id]))!;
    await query("INSERT INTO fixture_snapshots(fixture_id,job_id,payload,data_quality) VALUES('demo:d1',$1,$2,'{}')", [job.id,JSON.stringify({ fixture: { home:'A',away:'B',league:'DEMO' },model: { markets:[{ key:'1X2:HOME',label:'A câștigă',odds:1.5 }] } })]);
    await query("INSERT INTO final_decisions(job_id,fixture_id,outcome,market_key,votes_for,votes,validation,reason) VALUES($1,'demo:d1','QUALIFIED','1X2:HOME',6,'[]',$2,'DEMO')", [job.id,JSON.stringify({currentOdds:1.5,bookmaker:'DEMO'})]);
    await Promise.all(Array.from({ length: 10 }, (_, i) => recordEvent(job.id, { type:'JOB_RESUMED',stage:'QUEUED',payload:{ i } })));
    expect((await eventsAfter(job.id,0)).map(e=>e.seq)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(await jobMeta(user.id,job.id)).toMatchObject({batches:1,analyzed:1,qualified:1,lastSeq:10,mine:true});
    const archive=await listTickets(user.id);
    expect(archive).toEqual(expect.arrayContaining([expect.objectContaining({id:ticket.id,partialSelections:expect.arrayContaining([expect.objectContaining({market_label:'A câștigă',odds:1.5})]),creator:expect.objectContaining({mine:true})})]));
    expect(await ticketDetail(user.id,ticket.id)).toMatchObject({generationStatus:'INCOMPLETE',partialSelections:[{market_label:'A câștigă'}],mine:true});
  }));

  it('continues paused jobs after the daily reset and finishes incomplete tickets without the user', async () => scope(async () => {
    await query("UPDATE ticket_generation_jobs SET status='COMPLETED' WHERE status IN ('QUEUED','RUNNING','WAITING','PAUSED','INCOMPLETE')");
    const user = (await one<{ id: string }>("INSERT INTO users(google_sub,email,name) VALUES('auto-d1','auto@test.local','D1 Auto') RETURNING id"))!;
    const yesterday = new Date(Date.now() - 26 * 3600_000).toISOString();
    const paused = (await one<{ id: string }>("INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status,last_error,updated_at) VALUES($1,'CUSTOM_7','2026-10-26',3,'s','{}','{}','PAUSED','Cota zilnică openrouter este epuizată.',$2) RETURNING id", [user.id, yesterday]))!;
    const fresh = (await one<{ id: string }>("INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status,last_error) VALUES($1,'CUSTOM_8','2026-10-27',3,'s','{}','{}','PAUSED','Cota zilnică openrouter este epuizată.') RETURNING id", [user.id]))!;
    const done = (await one<{ id: string }>("INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status,finished_at) VALUES($1,'CUSTOM_9','2026-10-27',3,'s','{}','{}','INCOMPLETE',$2) RETURNING id", [user.id, new Date(Date.now() - 3600_000).toISOString()]))!;
    await query("INSERT INTO tickets(job_id,user_id,slot,period_key,target_odds,generation_status,outcome_status,summary) VALUES($1,$2,'CUSTOM_9','2026-10-27',3,'INCOMPLETE','NOT_APPLICABLE','{}')", [done.id, user.id]);
    const r = await autoContinueJobs();
    expect(r).toEqual({ resumed: 1, completed: 1 });
    const status = async (id: string) => (await one<{ status: string; config: unknown }>('SELECT status,config FROM ticket_generation_jobs WHERE id=$1', [id]))!;
    expect((await status(paused.id)).status).toBe('QUEUED');
    expect((await status(fresh.id)).status).toBe('PAUSED'); // the cap of today has not reset yet
    const d = await status(done.id);
    expect(d.status).toBe('QUEUED');
    expect((typeof d.config === 'string' ? JSON.parse(d.config) : d.config as { completion: unknown }).completion).toMatchObject({ attempt: 1, auto: true });
    expect((await eventsAfter(done.id, 0)).at(-1)).toMatchObject({ type: 'JOB_RESUMED', payload: { by: 'automat', completion: true } });
    expect(await autoContinueJobs()).toEqual({ resumed: 0, completed: 0 }); // nothing twice, runner already has work
  }));

  it('settles confirmed scores and exposes scheduler state without starting AI', async () => scope(async () => {
    const user = (await one<{id:string}>("SELECT id FROM users WHERE google_sub='archive-d1'"))!;
    const job = (await one<{id:string}>("INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,status) VALUES($1,'CUSTOM_2','2026-10-25',2,'demo','{}','COMPLETED') RETURNING id",[user.id]))!;
    const ticket = (await one<{id:string}>("INSERT INTO tickets(job_id,user_id,slot,period_key,target_odds,generation_status,outcome_status,summary) VALUES($1,$2,'CUSTOM_2','2026-10-25',2,'COMPLETED','PENDING','{}') RETURNING id",[job.id,user.id]))!;
    await query("INSERT INTO ticket_selections(ticket_id,fixture_id,position,market_key,market_label,odds,bookmaker,quote_observed_at,votes_for,risk,snapshot) VALUES($1,'demo:d1',1,'1X2:HOME','A câștigă',1.5,'DEMO',$2,6,'LOW','{}')",[ticket.id,new Date()]);
    await query("UPDATE fixtures SET home_score=2,away_score=0 WHERE id='demo:d1'");
    expect(await settlePending()).toMatchObject({status:'completed',detail:{selectionsChanged:1,ticketsChanged:1}});
    expect(await one('SELECT outcome_status FROM tickets WHERE id=$1',[ticket.id])).toEqual({outcome_status:'WON'});
    expect(await automationHealth()).toMatchObject({hosting:'cloudflare',execution:'cloudflare_scheduled',runs:expect.arrayContaining([expect.objectContaining({name:'settlement',last_error:null})])});
    const busy = await runAutomation('nested-lease',async()=>{
      expect(await runAutomation('nested-lease',async()=>({unexpected:true}))).toEqual({status:'busy'});
      return {verified:true};
    });
    expect(busy).toMatchObject({status:'completed'});
  }));

  it('applies the per-user daily limit atomically: 3 for others, 30 for the owner', async () => scope(async () => {
    const guest=(await one<{id:string}>("INSERT INTO users(google_sub,email) VALUES('guest-limit-d1','guest@test.local') RETURNING id"))!;
    const base={target:5,legs:3,agents:['victor','andrei','robert']};
    expect((await createCustomJob(guest.id,{...base,count:2,requestId:randomUUID()},new Date(),3)).jobIds).toHaveLength(2);
    await expect(createCustomJob(guest.id,{...base,count:2,requestId:randomUUID()},new Date(),3)).rejects.toMatchObject({status:429});
    expect((await createCustomJob(guest.id,{...base,count:1,requestId:randomUUID()},new Date(),3)).jobIds).toHaveLength(1);
    const owner=(await one<{id:string}>("INSERT INTO users(google_sub,email) VALUES('owner-limit-d1','owner@test.local') RETURNING id"))!;
    expect((await createCustomJob(owner.id,{...base,count:25,requestId:randomUUID()},new Date(),30)).jobIds).toHaveLength(25);
    await expect(createCustomJob(owner.id,{...base,count:6,requestId:randomUUID()},new Date(),30)).rejects.toMatchObject({status:429});
  }));

  it('atomically enforces 20 Custom jobs and stable retry IDs across concurrent requests', async () => scope(async () => {
    const user=(await one<{id:string}>("INSERT INTO users(google_sub,email) VALUES('custom-limit-d1','custom@test.local') RETURNING id"))!;
    const input={target:5,legs:3,agents:['victor','andrei','robert'],count:15,requestId:randomUUID()};
    const other={...input,requestId:randomUUID()};
    const results=await Promise.allSettled([createCustomJob(user.id,input),createCustomJob(user.id,other)]);
    if(results.every(r=>r.status==='rejected'))throw (results[0] as PromiseRejectedResult).reason;
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({status:429});
    const winner=results[0].status==='fulfilled'?input:other;
    const saved=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof createCustomJob>>>).value;
    expect(saved.jobIds).toHaveLength(15);
    const retry=await createCustomJob(user.id,winner,new Date(Date.now()+86400_000));
    expect(retry).toMatchObject({created:false,jobIds:saved.jobIds});
    await expect(createCustomJob(user.id,{...winner,target:6})).rejects.toMatchObject({status:409});
    expect(await one('SELECT count(*) AS n FROM ticket_generation_jobs WHERE user_id=$1',[user.id])).toEqual({n:15});
    expect(await one('SELECT count(*) AS n FROM d1_request_guards')).toEqual({n:0});
    const list=await customBatchJobs(user.id,winner.requestId);
    expect(list.map(j=>j.index)).toEqual(Array.from({length:15},(_,i)=>i+1));
    expect(await eventsAfter(saved.jobId,0)).toHaveLength(3);
    await createCustomJob(user.id,{...input,count:5,requestId:randomUUID()});
    await expect(createCustomJob(user.id,{...input,count:1,requestId:randomUUID()})).rejects.toMatchObject({status:429});
    expect(await one('SELECT count(*) AS n FROM ticket_generation_jobs WHERE user_id=$1',[user.id])).toEqual({n:20});
    const jobId=saved.jobId;
    await query("UPDATE ticket_generation_jobs SET status='PAUSED' WHERE id=$1",[jobId]);
    const resumes=await Promise.all([resumeJob(user.id,jobId),resumeJob(user.id,jobId)]);
    expect(resumes.filter(r=>r.resumed)).toHaveLength(1);
    expect(await eventsAfter(jobId,0)).toHaveLength(4);
    await query("UPDATE ticket_generation_jobs SET status='INCOMPLETE' WHERE id=$1",[jobId]);
    const partial=(await one<{id:string}>("INSERT INTO tickets(job_id,user_id,slot,period_key,target_odds,generation_status,outcome_status,summary) SELECT id,user_id,slot,period_key,target_odds,'INCOMPLETE','NOT_APPLICABLE','{}' FROM ticket_generation_jobs WHERE id=$1 RETURNING id",[jobId]))!;
    const completions=await Promise.all([completeIncompleteTicket(user.id,partial.id),completeIncompleteTicket(user.id,partial.id)]);
    expect(completions.filter(c=>c.resumed)).toHaveLength(1);
    expect(await eventsAfter(jobId,0)).toHaveLength(5);
    expect(await one<{config:{completion:{attempt:number}}}>('SELECT config FROM ticket_generation_jobs WHERE id=$1',[jobId])).toMatchObject({config:{completion:{attempt:1}}});
  }));

  it('reserves paid-model allowance across concurrent requests and retains uncertain calls',async()=>scope(async()=>{
    const results=await Promise.all([reservePaidCall('budget-test',600_000,1),reservePaidCall('budget-test',600_000,1)]);
    const held=results.find(Boolean)!;expect(results.filter(Boolean)).toHaveLength(1);
    expect(await reservePaidCall('budget-test',500_000,1)).toBeNull();
    await recordPaidCall(held,200_000);await recordPaidCall(held,200_000);
    expect(await one('SELECT total_microusd FROM d1_ai_budget_days ORDER BY day DESC LIMIT 1')).toEqual({total_microusd:200_000});
    expect(await reservePaidCall('budget-test',600_000,1)).not.toBeNull();
    expect(await reservePaidCall('budget-test',300_000,1)).toBeNull();
  }));

  it('runs the existing full analysis pipeline against D1 and replays without new model calls',async()=>scope(async()=>{
    const calls:Array<{ref:{provider:'groq'|'gemini'|'openrouter';model:string};stage:string}>=[];
    installFakes(demoFixtures(5,()=>({home:1.4,draw:4,away:7,dc:1.35})),{calls,pick:()=> '1X2:HOME'});
    try{
      const user=(await one<{id:string}>("INSERT INTO users(google_sub,email) VALUES('pipeline-d1','pipeline@test.local') RETURNING id"))!;
      const created=await createCustomJob(user.id,{target:2,legs:2,agents:['victor','andrei','robert']});
      for(let i=0;i<40;i++){
        const job=(await one<JobRow>('SELECT * FROM ticket_generation_jobs WHERE id=$1',[created.jobId]))!;
        if(['COMPLETED','INCOMPLETE','NO_BET'].includes(job.status))break;
        await runJobSlice(job,50_000);
      }
      const saved=(await one<{id:string;generation_status:string;leg_count:number}>('SELECT id,generation_status,leg_count FROM tickets WHERE job_id=$1',[created.jobId]))!;
      expect(saved).toMatchObject({generation_status:'COMPLETED',leg_count:2});
      const before=calls.length;
      const detail=await ticketDetail(user.id,saved.id);
      expect(detail).toMatchObject({mine:true,generationStatus:'COMPLETED'});
      expect(await eventsAfter(created.jobId,0)).not.toHaveLength(0);
      expect(calls).toHaveLength(before);
      const persisted=await one<{result:{ticketId:string}}>('SELECT result FROM ticket_generation_jobs WHERE id=$1',[created.jobId]);
      expect(persisted!.result.ticketId).toBe(saved.id);
    }finally{setAiTransportForTests(null);setFixtureProviderForTests(null);setHistoryProviderForTests(null);}
  }));
});
