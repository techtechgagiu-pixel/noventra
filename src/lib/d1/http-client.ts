import { signInternal } from '../internal-signature';
import { decodeRow, isRead, type Database, type Result, type Statement, type Row } from './client';

/** Pauses before sending a read again (perf 10.11: three tickets used to fail together on one D1 hiccup). */
export const READ_RETRY_DELAYS_MS=[400,1500];
class RetryableBridgeError extends Error {}

export function d1HttpDatabase(origin:string,secret:string):Database{
  const url=new URL('/_internal/database',origin);
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('The D1 bridge must use HTTPS');
  const sendOnce=async(statements:Statement[],batch:boolean):Promise<Result[]>=>{
    const body=JSON.stringify({statements,batch}),time=String(Date.now()),nonce=crypto.randomUUID();
    const signature=await signInternal(secret,url.pathname,body,time,nonce);
    let response:Response;
    try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-p11-time':time,'x-p11-nonce':nonce,'x-p11-signature':signature},body,signal:AbortSignal.timeout(30_000)});}
    catch(error){throw new RetryableBridgeError('D1 bridge: '+((error as Error).name==='TimeoutError'?'timeout':'network_error'));}
    const data=await response.json().catch(()=>({})) as {results?:Result[];error?:string};
    if(!response.ok||!data.results){
      const message='D1 bridge: '+(data.error??'unavailable');
      throw response.status>=500?new RetryableBridgeError(message):new Error(message);
    }
    return data.results.map(r=>({...r,rows:r.rows.map(decodeRow)}));
  };
  // Reads are sent again (each time with a fresh signature and nonce) when D1 or the network did not answer.
  // A write is never repeated automatically: a lost response is ambiguous, and the pipeline's stable
  // job/round identities handle explicit retries.
  const send=async(statements:Statement[],batch:boolean):Promise<Result[]>=>{
    const readOnly=statements.every(s=>isRead(s.text));
    for(let attempt=0;;attempt++){
      try{return await sendOnce(statements,batch);}
      catch(error){
        if(!readOnly||!(error instanceof RetryableBridgeError)||attempt>=READ_RETRY_DELAYS_MS.length)throw new Error((error as Error).message);
        await new Promise(r=>setTimeout(r,READ_RETRY_DELAYS_MS[attempt]));
      }
    }
  };
  return {dialect:'sqlite',async query<T extends Row>(text:string,params:unknown[]=[]){
    const [result]=await send([{text,params}],false);return {...result,rows:result.rows as T[]};
  },batch:statements=>send(statements,true)};
}
