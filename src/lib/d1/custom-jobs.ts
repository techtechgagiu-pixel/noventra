import { randomUUID, randomBytes } from 'node:crypto';
import { atomic, many } from '../db';
import { VOTING_AGENTS } from '../ai/agents';
import { CUSTOM_LIMIT_PER_DAY, type CustomConfig, type LegPolicy } from '../slots';
import type { Checkpoint } from '../jobs/types';
import { SlotError } from '../jobs/errors';
import { config } from '../config';

const canonical = (v: object) => JSON.stringify(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)));
type Existing = { id: string; config: { custom: CustomConfig; customBatch: { count: number } } };
async function previous(userId: string, requestId: string) {
  return many<Existing>(`SELECT id,config FROM ticket_generation_jobs WHERE user_id=$1 AND config->'customBatch'->>'id'=$2 ORDER BY CAST(config->'customBatch'->>'index' AS INTEGER)`,[userId,requestId]);
}
function reuse(rows: Existing[], custom: CustomConfig, count: number) {
  if (rows[0].config.customBatch.count!==count || canonical(rows[0].config.custom)!==canonical(custom)) throw new SlotError('Cererea a fost deja folosită cu alte setări. Reîncarcă formularul.',409);
  return {jobIds:rows.map(r=>r.id),created:false};
}

/** One atomic reservation for a whole 1..20 batch, even across concurrent HTTP
 * requests. No interactive transaction, advisory lock, or per-job round trips. */
export async function createD1CustomJobs(input: {
  userId: string; day: string; requestId: string; count: number; custom: CustomConfig;
  cfg: Record<string, unknown>; checkpoint: Checkpoint; policy: LegPolicy; callLimit: number;
}) {
  const {userId,day,requestId,count,custom,cfg,checkpoint,policy,callLimit}=input;
  const existing=await previous(userId,requestId);
  if(existing.length) return reuse(existing,custom,count);
  const owner=randomUUID(),settings=canonical(custom);
  const jobs=Array.from({length:count},(_,index)=>{
    const id=randomUUID(),seed=randomBytes(16).toString('hex'),batch={id:requestId,index:index+1,count};
    return {id,seed,config:{...cfg,customBatch:batch},batch};
  });
  const names=VOTING_AGENTS.filter(a=>custom.agents.includes(a.id)).map(a=>a.name);
  // All statements share the same parameters, so retry branches have identical semantics.
  const params=[userId,requestId,day,count,settings,owner,callLimit,JSON.stringify(jobs),JSON.stringify(checkpoint)];
  const events=jobs.flatMap(j=>[
    {jobId:j.id,seq:1,type:'JOB_CREATED',payload:{title:`CUSTOM — COTĂ ${custom.target}`,period:day,authorizedBy:'click PORNEȘTE DEZBATEREA',custom:{...custom,names},customBatch:j.batch}},
    {jobId:j.id,seq:2,type:'TARGET_SELECTED',payload:{target:custom.target,requiredLegs:custom.legs,tolerance:config.limits.targetTolerance,window:j.config,policy}},
    {jobId:j.id,seq:3,type:'SEED_GENERATED',payload:{seedPrefix:j.seed.slice(0,12),note:'Seed generat pe server; determină doar ordinea de explorare a meciurilor.'}},
  ]);
  const owned=`EXISTS(SELECT 1 FROM d1_custom_requests WHERE user_id=$1 AND request_id=$2 AND attempt_owner=$6)`;
  const batch=await atomic([
    {text:`INSERT INTO d1_request_guards(id,settings_match,budget_available) VALUES($6,
      CASE WHEN NOT EXISTS(SELECT 1 FROM d1_custom_requests WHERE user_id=$1 AND request_id=$2 AND (settings<>$5 OR count<>$4)) THEN 1 ELSE 0 END,
      CASE WHEN EXISTS(SELECT 1 FROM d1_custom_requests WHERE user_id=$1 AND request_id=$2) OR
        COALESCE((SELECT sum(requests) FROM provider_usage WHERE day=substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),1,10) AND provider IN ('groq','gemini','openrouter')),0)+20*$4<=$7 THEN 1 ELSE 0 END)`,params:params.slice(0,7)},
    {text:'INSERT INTO d1_custom_requests(user_id,request_id,period_key,count,settings,attempt_owner) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,request_id) DO NOTHING',params:params.slice(0,6)},
    {text:`INSERT INTO d1_custom_allowance(user_id,period_key,used) SELECT $1,$3,count(*) FROM ticket_generation_jobs WHERE user_id=$1 AND period_key=$3 AND substr(slot,1,7)='CUSTOM_' ON CONFLICT(user_id,period_key) DO NOTHING`,params:params.slice(0,3)},
    {text:`UPDATE d1_custom_allowance SET used=used+$4 WHERE user_id=$1 AND period_key=$3 AND ${owned} RETURNING used`,params:params.slice(0,6)},
    {text:`INSERT INTO ticket_generation_jobs(id,user_id,slot,period_key,target_odds,required_legs,seed,config,checkpoint,status,stage,last_event_seq)
      SELECT json_extract(j.value,'$.id'),$1,'CUSTOM_'||CAST((SELECT used FROM d1_custom_allowance WHERE user_id=$1 AND period_key=$3)-$4+CAST(j.key AS INTEGER)+1 AS INTEGER),$3,
      json_extract(j.value,'$.config.custom.target'),json_extract(j.value,'$.config.custom.legs'),json_extract(j.value,'$.seed'),json_extract(j.value,'$.config'),$9,'QUEUED','QUEUED',3
      FROM json_each($8) j WHERE ${owned}`,params},
    {text:`INSERT INTO analysis_events(job_id,seq,type,stage,payload)
      SELECT j.id,CAST(json_extract(e.value,'$.seq') AS INTEGER),json_extract(e.value,'$.type'),'QUEUED',json_set(json_extract(e.value,'$.payload'),'$.slot',j.slot)
      FROM json_each($10) e JOIN ticket_generation_jobs j ON j.id=json_extract(e.value,'$.jobId') WHERE ${owned}`,params:[...params,JSON.stringify(events)]},
    {text:`INSERT INTO audit_logs(user_id,action,detail)
      SELECT $1,'job_created',json_object('jobId',j.id,'slot',j.slot,'period',$3,'custom',json(j.config->'custom'),'customBatch',json(j.config->'customBatch'))
      FROM ticket_generation_jobs j WHERE j.user_id=$1 AND j.config->'customBatch'->>'id'=$2 AND ${owned}`,params:params.slice(0,6)},
    {text:'DELETE FROM d1_request_guards WHERE id=$1',params:[owner]},
  ]).catch((error:Error)=>{
    if(/custom_daily_cap/.test(error.message))throw new SlotError(`Limita de ${CUSTOM_LIMIT_PER_DAY} bilete custom pe zi ar fi depășită. Redu numărul de bilete.`,429);
    if(/request_settings_match/.test(error.message))throw new SlotError('Cererea a fost deja folosită cu alte setări. Reîncarcă formularul.',409);
    if(/request_budget_available/.test(error.message))throw new SlotError('Cota AI zilnică este aproape epuizată. Redu numărul de bilete.',503);
    throw error;
  });
  const persisted=await previous(userId,requestId);
  if(!persisted.length) throw new Error('The atomic D1 request returned no jobs');
  return {...reuse(persisted,custom,count),created:batch[3].rows.length>0};
}
