import { randomUUID } from 'node:crypto';
import { atomic, SQL_NOW } from '../db';
import type { Statement } from './client';
import { SlotError } from '../jobs/errors';
import type { EventType } from '../jobs/events';

type InitialEvent={type:EventType;payload:Record<string,unknown>};
export async function createD1Job(input:{
  userId:string;slot:string;day:string;target:number;requiredLegs:number|null;seed:string;
  config:unknown;checkpoint:unknown;events:InitialEvent[];review?:boolean;
}) {
  const id=randomUUID(),{userId,day}=input;
  const statements:Statement[]=[];
  if(input.review) statements.push(
    {text:"INSERT INTO d1_review_allowance(user_id,period_key,used) SELECT $1,$2,count(*) FROM ticket_generation_jobs WHERE user_id=$1 AND period_key=$2 AND substr(slot,1,7)='REVIEW_' ON CONFLICT(user_id,period_key) DO NOTHING",params:[userId,day]},
    {text:'UPDATE d1_review_allowance SET used=used+1 WHERE user_id=$1 AND period_key=$2',params:[userId,day]},
  );
  const insertion=statements.length;
  const slot=input.review?"(SELECT 'REVIEW_'||used FROM d1_review_allowance WHERE user_id=$2 AND period_key=$4)":'$3';
  statements.push(
    {text:`INSERT INTO ticket_generation_jobs(id,user_id,slot,period_key,target_odds,required_legs,seed,config,checkpoint,status,stage,last_event_seq)
      VALUES($1,$2,${slot},$4,$5,$6,$7,$8,$9,'QUEUED','QUEUED',$10) ON CONFLICT(user_id,slot,period_key) DO NOTHING RETURNING id`,params:[id,userId,input.slot,day,input.target,input.requiredLegs,input.seed,JSON.stringify(input.config),JSON.stringify(input.checkpoint),input.events.length]},
    {text:`INSERT INTO analysis_events(job_id,seq,type,stage,payload) SELECT j.id,CAST(e.key AS INTEGER)+1,json_extract(e.value,'$.type'),'QUEUED',json_set(json_extract(e.value,'$.payload'),'$.slot',j.slot)
      FROM ticket_generation_jobs j CROSS JOIN json_each($2) e WHERE j.id=$1`,params:[id,JSON.stringify(input.events)]},
    {text:"INSERT INTO audit_logs(user_id,action,detail) SELECT user_id,'job_created',json_object('jobId',id,'slot',slot,'period',period_key) FROM ticket_generation_jobs WHERE id=$1",params:[id]},
  );
  const saved=await atomic(statements).catch((error:Error)=>{
    if(/review_daily_cap/.test(error.message))throw new SlotError('Ai trimis deja 10 bilete la analiză azi. Revino mâine.',429);
    throw error;
  });
  return saved[insertion].rows[0] ? id : null;
}

/** The UPDATE must increment last_event_seq and return id. changes() is scoped
 * to the same native D1 batch transaction, so a failed CAS cannot emit an event. */
export async function transitionD1Job(update:Statement, jobId:string,event:{type:EventType;stage:string;payload:Record<string,unknown>},audit?:{userId:string;action:string;detail:Record<string,unknown>}) {
  const statements:Statement[]=[update,{
    text:'INSERT INTO analysis_events(job_id,seq,type,stage,payload) SELECT id,last_event_seq,$2,$3,$4 FROM ticket_generation_jobs WHERE id=$1 AND changes()=1',
    params:[jobId,event.type,event.stage,JSON.stringify(event.payload)],
  }];
  if(audit)statements.push({text:`INSERT INTO audit_logs(user_id,action,detail) SELECT $1,$2,$3 WHERE changes()=1`,params:[audit.userId,audit.action,JSON.stringify(audit.detail)]});
  const saved=await atomic(statements);
  return saved[0].rows.length>0;
}

export function resumeD1Job(userId:string,jobId:string) {
  return transitionD1Job({text:`UPDATE ticket_generation_jobs SET status='QUEUED',next_run_at=${SQL_NOW()},attempt_count=0,last_error=NULL,lease_owner=NULL,lease_expires_at=NULL,last_event_seq=last_event_seq+1
    WHERE id=$1 AND user_id=$2 AND status IN ('PAUSED','FAILED','WAITING') RETURNING id`,params:[jobId,userId]},jobId,
    {type:'JOB_RESUMED',stage:'QUEUED',payload:{by:'user',note:'Reluare a aceleiași analize, cu același seed și aceeași ordine a meciurilor.'}});
}
