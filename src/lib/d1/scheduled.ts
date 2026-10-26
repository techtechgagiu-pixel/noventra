import { one, query } from '../db';
import { settlePending } from '../settlement';

/** Only wakes an existing runner, which drains already-authorized queued jobs.
 * A wake never creates a ticket or calls a model by itself. */
export async function wakeAnalysisRunner(origin:string|undefined){
  if(!origin)return {status:'not-configured'};
  const url=new URL('/api/health',origin);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.onrender.com'))throw new Error('Invalid Render runner origin');
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:'error'});
    await response.body?.cancel();
    return {status:response.ok?'awake':'starting'};
  }catch{return {status:'starting'};}
}

export async function scheduledMaintenance(runner:string|undefined){
  await query('DELETE FROM d1_bridge_nonces WHERE expires_at<$1',[Date.now()]);
  const queued=await one<{n:number}>("SELECT count(*) AS n FROM ticket_generation_jobs WHERE status IN ('QUEUED','WAITING') OR (status='RUNNING' AND julianday(lease_expires_at)<julianday('now'))");
  const wake=queued?.n?await wakeAnalysisRunner(runner):{status:'idle'};
  return {queued:queued?.n??0,wake};
}
export const scheduledSettlementPage=()=>settlePending();
