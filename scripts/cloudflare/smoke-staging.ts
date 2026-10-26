import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { withDatabase, one, query } from '../../src/lib/db';
import { d1HttpDatabase } from '../../src/lib/d1/http-client';

const origin=process.env.CF_STAGING_ORIGIN??'http://localhost:8788';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))throw new Error('This fixture smoke test is local only');
const vars=await readFile('.dev.vars','utf8');
const secret=vars.match(/^D1_BRIDGE_SECRET="([^"]+)"/m)?.[1];
if(!secret)throw new Error('Local .dev.vars bridge secret missing');
const db=d1HttpDatabase(origin,secret);
const token=randomBytes(32).toString('base64url'),tokenHash=createHash('sha256').update(token).digest('hex');
await withDatabase(db,async()=>{
  const user=(await one<{id:string}>("INSERT INTO users(google_sub,email,name) VALUES('staging-local-smoke','demo@local.invalid','DEMO LOCAL — D1') ON CONFLICT(google_sub) DO UPDATE SET name=excluded.name RETURNING id"))!;
  await query('INSERT INTO sessions(id,user_id,expires_at,google_login) VALUES($1,$2,$3,1)',[tokenHash,user.id,new Date(Date.now()+3600_000)]);
  try{
    const paths=['/','/login','/termeni','/confidentialitate','/api/health','/api/agents','/api/statistics','/api/tickets','/api/custom-tickets','/api/ticket-slots','/api/queue','/api/matches','/api/fixtures','/api/performance','/?tab=statistici'];
    const results=[];
    for(const path of paths){
      const response=await fetch(origin+path,{headers:path==='/login'?{}:{cookie:`bm_sid=${token}`},redirect:'manual'});
      const text=await response.text();
      if(response.status!==200)throw new Error(`${path}: HTTP ${response.status}: ${text.slice(0,200)}`);
      if(response.headers.get('content-type')?.includes('json'))JSON.parse(text);
      results.push({path,status:response.status});
    }
    const denied=await fetch(origin+'/api/admin/automation',{headers:{cookie:`bm_sid=${token}`}});
    if(denied.status!==403)throw new Error('A Google user gained administrator access');
    const unauthorized=await fetch(origin+'/_internal/database',{method:'POST',body:'{}'});
    if(unauthorized.status!==401)throw new Error('Unsigned database request accepted');
    const cron=await fetch(origin+'/cdn-cgi/handler/scheduled?cron=*%2F5%20*%20*%20*%20*');
    if(!cron.ok)throw new Error('Local scheduled handler failed');
    await cron.text();
    const repeat=await fetch(origin+'/cdn-cgi/handler/scheduled?cron=*%2F5%20*%20*%20*%20*');
    if(!repeat.ok)throw new Error('Duplicate scheduled delivery was not idempotent');
    await repeat.text();
    let pass:unknown=null;
    for(let attempt=0;attempt<20;attempt++){
      pass=await one("SELECT last_success_at,last_error FROM automation_runs WHERE name='settlement' AND last_success_at IS NOT NULL");
      if(pass)break;
      await new Promise(r=>setTimeout(r,250));
    }
    if(!pass)throw new Error('Workflow did not persist a successful settlement pass');
    console.log(JSON.stringify({status:'local-staging-verified',checks:results,googleAdminDenied:denied.status,unsignedBridgeDenied:unauthorized.status,scheduledSettlement:pass,realAiCalls:0},null,2));
  }finally{
    await query('DELETE FROM sessions WHERE id=$1',[tokenHash]);
    await query('DELETE FROM users WHERE id=$1',[user.id]);
  }
});
