import { signInternal } from '../internal-signature';
import { decodeRow, type Database, type Result, type Statement, type Row } from './client';

export function d1HttpDatabase(origin:string,secret:string):Database{
  const url=new URL('/_internal/database',origin);
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('The D1 bridge must use HTTPS');
  const send=async(statements:Statement[],batch:boolean):Promise<Result[]>=>{
    const body=JSON.stringify({statements,batch}),time=String(Date.now()),nonce=crypto.randomUUID();
    const signature=await signInternal(secret,url.pathname,body,time,nonce);
    // No automatic retry of an ambiguous write. The pipeline's stable job/round
    // identities handle explicit retries; a lost response is not a second insert.
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-p11-time':time,'x-p11-nonce':nonce,'x-p11-signature':signature},body,signal:AbortSignal.timeout(30_000)});
    const data=await response.json() as {results?:Result[];error?:string};
    if(!response.ok||!data.results)throw new Error('D1 bridge: '+(data.error??'unavailable'));
    return data.results.map(r=>({...r,rows:r.rows.map(decodeRow)}));
  };
  return {dialect:'sqlite',async query<T extends Row>(text:string,params:unknown[]=[]){
    const [result]=await send([{text,params}],false);return {...result,rows:result.rows as T[]};
  },batch:statements=>send(statements,true)};
}
