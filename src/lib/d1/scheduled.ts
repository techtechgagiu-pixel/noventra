import { one, query } from '../db';
import { settlePending } from '../settlement';
import { autoContinueJobs } from './auto-continue';
import { csWakeDue } from '../cs/sync';

/** Only wakes an existing runner, which drains already-authorized queued jobs.
 * A wake never creates a ticket or calls a model by itself. */
export async function wakeAnalysisRunner(origin:string|undefined){
  if(!origin)return {status:'not-configured'};
  const url=new URL('/api/health',origin);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.onrender.com'))throw new Error('Invalid Render runner origin');
  try{
    // workerd rejects redirect:'error' before sending the request. Manual keeps
    // the wake on the configured origin without following an unexpected redirect.
    const response=await fetch(url,{signal:AbortSignal.timeout(25_000),redirect:'manual'});
    await response.body?.cancel();
    return {status:response.ok?'awake':'starting',httpStatus:response.status};
  }catch(error){return {status:'starting',reason:error instanceof Error?`${error.name}: ${error.message.slice(0,180)}`:'network_error'};}
}

export async function scheduledMaintenance(runner:string|undefined){
  await query('DELETE FROM d1_bridge_nonces WHERE expires_at<$1',[Date.now()]);
  // Keep the runner awake for its final active jobs too: outgoing AI requests
  // alone do not prevent a Free web service from spinning down.
  // Paused or incomplete tickets continue on their own, even with nobody on the site.
  const auto=await autoContinueJobs().catch(()=>({resumed:0,completed:0}));
  const queued=await one<{n:number}>("SELECT count(*) AS n FROM ticket_generation_jobs WHERE status IN ('QUEUED','WAITING','RUNNING')");
  // The runner also refreshes Counter-Strike data every 30 minutes (it holds the PandaScore/OddsPapi keys).
  const cs=!!runner&&!queued?.n&&await csWakeDue().catch(()=>false);
  const wake=queued?.n||cs?await wakeAnalysisRunner(runner):{status:'idle'};
  return {queued:queued?.n??0,wake,auto,...(cs?{csSync:true}:{})};
}
export const scheduledSettlementPage=()=>settlePending();
