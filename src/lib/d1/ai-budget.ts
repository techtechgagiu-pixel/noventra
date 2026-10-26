import { atomic } from '../db';
import { OPENROUTER_PRICE } from '../ai/openrouter-models';
import { utcDay } from '../usage';

/** Micro-dollars avoid floating-point comparisons in the shared allowance. */
export async function reservePaidCall(model:string,amount:number,limitUsd:number){
  const id=crypto.randomUUID(),day=utcDay(),limit=Math.floor(limitUsd*1e6);
  if(!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(limit)||limit<0)throw new Error('Invalid paid-model allowance');
  const prices=JSON.stringify(Object.fromEntries([...OPENROUTER_PRICE].map(([id,p])=>[id,{i:p.inPerM,o:p.outPerM}])));
  const result=await atomic([
    {text:`INSERT INTO d1_ai_budget_days(day,total_microusd)
      SELECT $1,CAST(ceil(COALESCE(sum(COALESCE(l.input_tokens,0)*COALESCE(json_extract(p.value,'$.i'),1)+COALESCE(l.output_tokens,0)*COALESCE(json_extract(p.value,'$.o'),3)),0)) AS INTEGER)
      FROM model_usage_logs l LEFT JOIN json_each($2) p ON p.key=l.requested_model_id
      WHERE l.provider='openrouter' AND julianday(l.created_at)>=julianday($1) AND julianday(l.created_at)<julianday($1,'+1 day')
      ON CONFLICT(day) DO NOTHING`,params:[day,prices]},
    {text:'UPDATE d1_ai_budget_days SET total_microusd=total_microusd+$2 WHERE day=$1 AND total_microusd+$2<=$3',params:[day,amount,limit]},
    {text:'INSERT INTO d1_ai_budget_reservations(id,day,model,reserved_microusd) SELECT $1,$2,$3,$4 WHERE changes()=1 RETURNING id',params:[id,day,model,amount]},
  ]);
  return result[2].rows.length?id:null;
}
export async function recordPaidCall(id:string,actual:number){
  if(!Number.isSafeInteger(actual)||actual<0)throw new Error('Invalid paid-model usage');
  await atomic([
    {text:`UPDATE d1_ai_budget_days SET total_microusd=max(0,total_microusd-(SELECT reserved_microusd FROM d1_ai_budget_reservations WHERE id=$1)+$2)
      WHERE day=(SELECT day FROM d1_ai_budget_reservations WHERE id=$1 AND status='held')`,params:[id,actual]},
    {text:"UPDATE d1_ai_budget_reservations SET actual_microusd=$2,status='recorded' WHERE id=$1 AND status='held' AND changes()=1",params:[id,actual]},
  ]);
}
export function paidCallUpperEstimate(model:string,input:{system:string;user:string;maxOutputTokens?:number}){
  const price=OPENROUTER_PRICE.get(model);
  if(!price)return null; // Unknown paid prices require explicit catalogue configuration.
  const bytes=new TextEncoder().encode(input.system+input.user).byteLength+512;
  const output=Math.min(8000,Math.max(input.maxOutputTokens??2200,4000));
  return Math.max(1,Math.ceil(bytes*price.inPerM+output*price.outPerM));
}
export function paidCallActual(model:string,inputTokens:number|null,outputTokens:number|null){
  const price=OPENROUTER_PRICE.get(model);
  return price&&inputTokens!==null&&outputTokens!==null?Math.max(0,Math.ceil(inputTokens*price.inPerM+outputTokens*price.outPerM)):null;
}
