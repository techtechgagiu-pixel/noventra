import { afterAll, beforeEach, expect, it } from 'vitest';
import { many, one, pool, query } from '@/lib/db';
import { completeIncompleteTicket, createCustomJob } from '@/lib/jobs/service';
import { _processOneForTests } from '@/lib/jobs/worker';
import { clearFakes, closePool, demoFixtures, installFakes, makeUser, resetDb } from './helpers';
const ai=()=>({calls:[],pick:(id:string)=> Number(id.split(':')[1])%2 ? 'TOTAL:OVER:1.5' : '1X2:HOME'});
const config={target:5,legs:4,agents:['andrei','alex','ioana'],fromHours:2,toHours:48};
async function drain(id:string){for(let i=0;i<200;i++){const j=await one<{status:string}>('SELECT status FROM ticket_generation_jobs WHERE id=$1',[id]);if(['COMPLETED','INCOMPLETE','NO_BET','FAILED','PAUSED'].includes(j!.status))return j!.status;await _processOneForTests();}throw Error('Not terminal');}
async function partial(){installFakes(demoFixtures(2,()=>({home:1.4,draw:4,away:6,dc:1.1})),ai());const user=await makeUser();const r=await createCustomJob(user,config);expect(await drain(r.jobId)).toBe('INCOMPLETE');const t=await one<{id:string}>('SELECT id FROM tickets WHERE job_id=$1',[r.jobId]);return{user,job:r.jobId,ticket:t!.id};}
beforeEach(async()=>{await resetDb();clearFakes();});afterAll(async()=>{clearFakes();await closePool();});
it('finishes the SAME ticket with new fixtures, preserving the seed, accepted picks and previous predictions',async()=>{
 const p=await partial();const old=await one<{seed:string;analyzed:number}>("SELECT seed,(checkpoint->>'analyzed')::int AS analyzed FROM ticket_generation_jobs WHERE id=$1",[p.job]);
 const predictions=(await many<{id:string}>('SELECT id::text id FROM agent_predictions WHERE job_id=$1 ORDER BY agent_predictions.id',[p.job])).map(x=>x.id);
 installFakes(demoFixtures(4,i=>({home:i<2?1.4:1.6,draw:4,away:6,dc:1.1})),ai());
 const requests=await Promise.all(Array.from({length:4},()=>completeIncompleteTicket(p.user,p.ticket)));
 expect(requests.filter(r=>r.resumed)).toHaveLength(1);expect(new Set(requests.map(r=>r.jobId))).toEqual(new Set([p.job]));
 expect(await drain(p.job)).toBe('COMPLETED');
 const tickets=await many<{id:string;leg_count:number;generation_status:string;actual_odds:string}>('SELECT id,leg_count,generation_status,actual_odds FROM tickets WHERE job_id=$1',[p.job]);
 expect(tickets).toHaveLength(1);expect(tickets[0]).toMatchObject({id:p.ticket,leg_count:4,generation_status:'COMPLETED'});expect(Number(tickets[0].actual_odds)).toBeCloseTo(1.4*1.4*1.6*1.6,2);
 expect((await one<{seed:string}>('SELECT seed FROM ticket_generation_jobs WHERE id=$1',[p.job]))!.seed).toBe(old!.seed);
 const now=(await many<{id:string}>('SELECT id::text id FROM agent_predictions WHERE job_id=$1 ORDER BY agent_predictions.id',[p.job])).map(x=>x.id);expect(now.slice(0,predictions.length)).toEqual(predictions);
 const legs=await many<{fixture_id:string}>('SELECT fixture_id FROM ticket_selections WHERE ticket_id=$1',[p.ticket]);expect(legs.map(x=>x.fixture_id).sort()).toEqual(['demo:0','demo:1','demo:2','demo:3']);
 expect((await one<{n:number}>('SELECT count(*)::int n FROM ticket_generation_jobs'))?.n).toBe(1);
 await expect(completeIncompleteTicket(p.user,p.ticket)).rejects.toThrow(/Doar un bilet incomplet/);
});
it.each(['absent','played','stale','unacceptable-price'])('keeps incomplete history and never finalizes invalid old selections: %s',async(mode)=>{
 const p=await partial();
 const fixtures=demoFixtures(2,()=>({home:1.4,draw:4,away:6,dc:1.1})).map(f=>{
   if(mode==='played')return{...f,status:'post' as const,kickoff:new Date(Date.now()-3600_000).toISOString(),homeScore:2,awayScore:0};
   if(mode==='stale')return{...f,odds:{...f.odds!,observedAt:new Date(Date.now()-48*3600_000).toISOString()}};
   if(mode==='unacceptable-price')return{...f,odds:{...f.odds!,markets:f.odds!.markets.map(m=>({...m,odds:4}))}};
   return f;
 });
 installFakes(mode==='absent'?[]:fixtures,ai());await completeIncompleteTicket(p.user,p.ticket);expect(await drain(p.job)).toBe('INCOMPLETE');
 expect((await one<{generation_status:string}>('SELECT generation_status FROM tickets WHERE id=$1',[p.ticket]))?.generation_status).toBe('INCOMPLETE');
 expect((await one<{n:number}>("SELECT count(*)::int n FROM final_decisions WHERE job_id=$1 AND outcome='QUALIFIED'",[p.job]))?.n).toBe(2);
 expect((await one<{n:number}>('SELECT count(*)::int n FROM ticket_selections WHERE ticket_id=$1',[p.ticket]))?.n).toBe(0);
});
it('rejects another user and resumes a paused completion without restarting its checkpoint',async()=>{
 const p=await partial();const other=await makeUser('other@t');await expect(completeIncompleteTicket(other,p.ticket)).rejects.toThrow(/nu îți aparține/);
 await completeIncompleteTicket(p.user,p.ticket);
 await query("UPDATE ticket_generation_jobs SET status='PAUSED',checkpoint=jsonb_set(checkpoint,'{phase}','\"BUILD\"') WHERE id=$1",[p.job]);
 await completeIncompleteTicket(p.user,p.ticket);
 const j=await one<{config:{completion:{attempt:number}};checkpoint:{phase:string}}> ('SELECT config,checkpoint FROM ticket_generation_jobs WHERE id=$1',[p.job]);expect(j!.checkpoint.phase).toBe('BUILD');expect(j!.config.completion.attempt).toBe(1);
});

it('does not wait on a ticket row held by an active worker when completion is already running',async()=>{
 const p=await partial();await completeIncompleteTicket(p.user,p.ticket);await query("UPDATE ticket_generation_jobs SET status='RUNNING' WHERE id=$1",[p.job]);
 const c=await pool().connect();let timer:ReturnType<typeof setTimeout>|undefined;
 try{await c.query('BEGIN');await c.query("UPDATE tickets SET summary=summary WHERE id=$1",[p.ticket]);
   const r=await Promise.race([completeIncompleteTicket(p.user,p.ticket),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Blocked behind worker ticket lock')),1000);})]);
   expect(r.resumed).toBe(false);expect(r.jobId).toBe(p.job);
 }finally{clearTimeout(timer);await c.query('ROLLBACK');c.release();}
});
