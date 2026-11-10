import type { D1Database } from '@cloudflare/workers-types';
import { verifyInternal } from '../internal-signature';
import { d1Database, isTransientD1Error, type Statement } from './client';
import { splitSqlScript } from './sql-script';

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
/** Server-to-server only: equivalent to Render's previous DB credentials.
 * No Cloudflare account API token is given to Render or to a visitor. */
export async function databaseBridge(request:Request,binding:D1Database,secret:string){
  if(request.method!=='POST')return reply({error:'unauthorized'},401);
  let body='';
  const reader=request.body?.getReader();
  if(!reader)return reply({error:'invalid_request'},400);
  const chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2_000_000){await reader.cancel();return reply({error:'request_too_large'},413);}chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}body=new TextDecoder('utf8',{fatal:true}).decode(bytes);
  }catch{return reply({error:'invalid_request'},400);}
  const nonce=await verifyInternal(secret,new URL(request.url).pathname,body,request.headers);
  if(!nonce)return reply({error:'unauthorized'},401);
  let input:{statements:Statement[];batch:boolean};
  try{
    input=JSON.parse(body);
    if(!Array.isArray(input.statements)||!input.statements.length||input.statements.length>50||typeof input.batch!=='boolean'||(!input.batch&&input.statements.length!==1))throw new Error();
    for(const statement of input.statements){
      if(typeof statement.text!=='string'||new TextEncoder().encode(statement.text).length>100_000||splitSqlScript(statement.text).length!==1||!/^\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(statement.text)||!Array.isArray(statement.params??[])||(statement.params?.length??0)>100)throw new Error();
    }
  }catch{return reply({error:'invalid_request'},400);}
  // Perf 10.11: the replay guard travels in the same atomic batch as the work, so one bridge call is one D1 round trip
  // (it used to be two: the nonce insert, then the query). A replayed nonce rolls the whole batch back.
  const guard:Statement={text:'INSERT INTO d1_bridge_nonces(nonce,expires_at) VALUES($1,$2)',params:[nonce,Date.now()+120_000]};
  try{
    const results=(await d1Database(binding).batch!([guard,...input.statements])).slice(1);
    return reply({results});
  }catch(error){
    const message=(error as Error)?.message??'';
    // Only the guard's own constraint means a replay; a statement can fail its own UNIQUE constraint (that stays 409).
    if(/UNIQUE constraint failed: d1_bridge_nonces\./.test(message))return reply({error:'replayed_request'},401);
    const known=['custom_daily_cap','review_daily_cap','request_settings_match','request_budget_available'];
    const code=known.find(c=>message.includes(c));
    if(code)return reply({error:code},409);
    const transient=isTransientD1Error(error);
    console.warn(JSON.stringify({event:'database_bridge_failed',code:transient?'database_unavailable':'database_operation_failed',message:message.slice(0,240)}));
    // 503 = D1 did not answer (overload, reset, timeout): the runner may send a read again.
    return transient?reply({error:'database_unavailable'},503):reply({error:'database_operation_failed'},409);
  }
}
