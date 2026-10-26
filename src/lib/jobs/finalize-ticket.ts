import { randomUUID } from 'node:crypto';
import { atomic, dialect, SQL_NOW, isD1 } from '../db';
import type { Statement } from '../d1/client';
import type { JobRow } from './pipeline';

export type SavedLeg = {
  fixtureId: string; marketKey: string; label: string; odds: number; bookmaker: string;
  observedAt: string; votes: number; probability: number | null; risk: string; snapshot: Record<string, unknown>;
};

/** Ticket, legs and job terminal state are one real transaction in either DB.
 * References use the persisted ticket ID, including a retry racing an earlier save. */
export async function finalizeTicket(job: JobRow, result: {
  generation: 'COMPLETED' | 'INCOMPLETE' | 'NO_BET'; totalOdds: number | null;
  mixedBookmakers: boolean; summary: Record<string, unknown>; selections: SavedLeg[];
}) {
  const changed = job.config.completion
    ? 'actual_odds=EXCLUDED.actual_odds,leg_count=EXCLUDED.leg_count,generation_status=EXCLUDED.generation_status,outcome_status=EXCLUDED.outcome_status,mixed_bookmakers=EXCLUDED.mixed_bookmakers,summary=EXCLUDED.summary'
    : 'job_id=EXCLUDED.job_id';
  const statements: Statement[] = [{
    text: `INSERT INTO tickets(id,job_id,user_id,slot,period_key,target_odds,actual_odds,leg_count,generation_status,outcome_status,mixed_bookmakers,summary)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(job_id) DO UPDATE SET ${changed} RETURNING id`,
    params: [randomUUID(),job.id,job.user_id,job.slot,job.period_key,job.target_odds,result.totalOdds,result.selections.length,result.generation,result.generation==='COMPLETED'?'PENDING':'NOT_APPLICABLE',result.mixedBookmakers,JSON.stringify(result.summary)],
  }];
  result.selections.forEach((leg, i) => statements.push({
    text: `INSERT INTO ticket_selections(ticket_id,fixture_id,position,market_key,market_label,odds,bookmaker,quote_observed_at,votes_for,model_probability,risk,snapshot)
      VALUES((SELECT id FROM tickets WHERE job_id=$1),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(ticket_id,fixture_id) DO NOTHING`,
    params: [job.id,leg.fixtureId,i+1,leg.marketKey,leg.label,leg.odds,leg.bookmaker,leg.observedAt,leg.votes,leg.probability,leg.risk,JSON.stringify(leg.snapshot)],
  }));
  const terminal=`UPDATE ticket_generation_jobs SET status=$2,stage='DONE',finished_at=${SQL_NOW()},result=${dialect("jsonb_set($3::jsonb,'{ticketId}',to_jsonb((SELECT id::text FROM tickets WHERE job_id=$1)))", "json_set($3,'$.ticketId',(SELECT id FROM tickets WHERE job_id=$1))")},lease_owner=NULL,lease_expires_at=NULL,checkpoint=$4,last_event_seq=last_event_seq+1
    WHERE id=$1 AND status NOT IN ('COMPLETED','INCOMPLETE','NO_BET')`;
  const params=[job.id,result.generation,JSON.stringify({generation:result.generation,totalOdds:result.totalOdds}),JSON.stringify({...job.checkpoint,phase:'DONE'})];
  const payload=JSON.stringify({generation:result.generation,totalOdds:result.totalOdds,legs:result.selections.length,target:Number(job.target_odds),reason:result.summary.reason,
    ...(job.config.review?{review:true}:{mixedBookmakers:result.mixedBookmakers})});
  // Terminal status and its final event must become visible together. A viewer
  // draining last_event_seq may otherwise close before TICKET_FINALIZED exists.
  if(isD1())statements.push(
    {text:terminal,params},
    {text:"INSERT INTO analysis_events(job_id,seq,type,stage,payload) SELECT id,last_event_seq,'TICKET_FINALIZED','DONE',$2 FROM ticket_generation_jobs WHERE id=$1 AND changes()=1",params:[job.id,payload]},
  );
  else statements.push({text:`WITH terminal AS (${terminal} RETURNING id,last_event_seq)
    INSERT INTO analysis_events(job_id,seq,type,stage,payload) SELECT id,last_event_seq,'TICKET_FINALIZED','DONE',$5 FROM terminal`,params:[...params,payload]});
  const saved = await atomic(statements);
  return String(saved[0].rows[0].id);
}
