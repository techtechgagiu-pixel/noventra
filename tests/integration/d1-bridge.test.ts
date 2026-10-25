import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { databaseBridge } from '@/lib/d1/bridge';
import { d1HttpDatabase } from '@/lib/d1/http-client';
import { d1Database } from '@/lib/d1/client';
import { splitSqlScript } from '@/lib/d1/sql-script';
import { signInternal } from '@/lib/internal-signature';
import { withDatabase, one, query, atomic } from '@/lib/db';
import { createCustomJob } from '@/lib/jobs/service';
import { _claimForTests, _processOneForTests } from '@/lib/jobs/worker';
import { installFakes, demoFixtures } from '@/lib/testing/fakes';
import { setAiTransportForTests } from '@/lib/ai/router';
import { setFixtureProviderForTests } from '@/lib/sports/fixtures';
import { setHistoryProviderForTests } from '@/lib/scout/history';
import { storedCatalog, refreshStoredCatalog } from '@/lib/d1/catalog';
import { scheduledMaintenance } from '@/lib/d1/scheduled';

const secret='local-test-secret-not-a-production-credential-64';
describe('authenticated Render → Cloudflare D1 bridge',()=>{
  let mf:Miniflare,binding:Awaited<ReturnType<Miniflare['getD1Database']>>,server:Server,origin:string;
  const scope=<T>(work:()=>T)=>withDatabase(d1HttpDatabase(origin,secret),work);
  const signed=async(body:string,time=String(Date.now()),nonce=crypto.randomUUID())=>new Request(origin+'/_internal/database',{method:'POST',body,headers:{'x-p11-time':time,'x-p11-nonce':nonce,'x-p11-signature':await signInternal(secret,'/_internal/database',body,time,nonce)}});
  beforeAll(async()=>{
    mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-10-25',d1Databases:['DB']}));
    binding=await mf.getD1Database('DB');
    for(const file of ['0001_legacy_schema.sql','0002_agent_configuration.sql','0003_request_coordination.sql','0004_league_configuration.sql','0005_worker_bridge.sql','0006_ai_budget.sql']){
      const statements=splitSqlScript(await readFile('cloudflare/d1/migrations/'+file,'utf8'));
      for(let i=0;i<statements.length;i+=20)await binding.batch(statements.slice(i,i+20).map(s=>binding.prepare(s)));
    }
    server=createServer(async(req,res)=>{
      try{
        const chunks:Buffer[]=[];for await(const part of req)chunks.push(part);
        const response=await databaseBridge(new Request(origin+req.url,{method:req.method,headers:req.headers as Record<string,string>,body:req.method==='POST'?Buffer.concat(chunks).toString():undefined}),binding,secret);
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
      }catch{res.writeHead(500);res.end('local bridge failed');}
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();if(!address||typeof address==='string')throw new Error('local listener');
    origin=`http://127.0.0.1:${address.port}`;
  });
  afterAll(async()=>{await new Promise<void>(resolve=>server?.close(()=>resolve()));await mf?.dispose();});

  it('rejects bad signatures, tampered bodies, expired requests and replayed nonces',async()=>{
    const body=JSON.stringify({statements:[{text:'SELECT 1 AS n'}],batch:false});
    expect((await databaseBridge(new Request(origin,{method:'POST',body}),binding,secret)).status).toBe(401);
    const expired=await signed(body,String(Date.now()-120_000));
    expect((await databaseBridge(expired,binding,secret)).status).toBe(401);
    const request=await signed(body);
    const altered=new Request(request,{body:body+' '});
    expect((await databaseBridge(altered,binding,secret)).status).toBe(401);
    const nonce=crypto.randomUUID();
    expect((await databaseBridge(await signed(body,undefined,nonce),binding,secret)).status).toBe(200);
    expect((await databaseBridge(await signed(body,undefined,nonce),binding,secret)).status).toBe(401);
  });
  it('blocks DDL/multiple statements and rolls back a failed atomic batch over HTTP',async()=>scope(async()=>{
    for(const text of ['DROP TABLE users','SELECT 1; DELETE FROM users;','BEGIN']){
      const response=await databaseBridge(await signed(JSON.stringify({statements:[{text}],batch:false})),binding,secret);
      expect(response.status).toBe(400);
    }
    await expect(atomic([
      {text:"INSERT INTO users(id,google_sub,email) VALUES('bridge-rollback','bridge-rollback','local@test')"},
      {text:"INSERT INTO sessions(id,user_id,expires_at) VALUES('broken','unknown','2030-01-01')"},
    ])).rejects.toThrow(/database_operation_failed/);
    expect(await one("SELECT id FROM users WHERE id='bridge-rollback'")).toBeNull();
    expect(await one('SELECT $2 AS repeated,$1 AS first,$2 AS again',[3,7])).toEqual({repeated:7,first:3,again:7});
  }));
  it('claims at most two jobs globally and runs/resumes existing analysis on the Node runner',async()=>scope(async()=>{
    const calls:Array<{ref:{provider:'groq'|'gemini'|'openrouter';model:string};stage:string}>=[];
    installFakes(demoFixtures(5,()=>({home:1.4,draw:4,away:7,dc:1.35})),{calls,pick:()=> '1X2:HOME'});
    try{
      const user=(await one<{id:string}>("INSERT INTO users(google_sub,email) VALUES('bridge-runner','runner@test') RETURNING id"))!;
      const created=await createCustomJob(user.id,{target:2,legs:2,agents:['victor','andrei','robert'],count:3});
      const claims=await Promise.all([_claimForTests(),_claimForTests(),_claimForTests()]);
      expect(claims.filter(Boolean)).toHaveLength(2);
      expect(new Set(claims.filter(Boolean).map(c=>c!.id)).size).toBe(2);
      await query("UPDATE ticket_generation_jobs SET status='PAUSED',lease_owner=NULL,lease_expires_at=NULL WHERE user_id=$1",[user.id]);
      await query("UPDATE ticket_generation_jobs SET status='RUNNING',stage='QUEUED',lease_expires_at='2000-01-01' WHERE id=$1",[created.jobId]);
      for(let i=0;i<40;i++){
        const job=await one<{status:string}>('SELECT status FROM ticket_generation_jobs WHERE id=$1',[created.jobId]);
        if(job?.status==='COMPLETED')break;
        expect(await _processOneForTests()).toBe(true);
      }
      expect(await one('SELECT generation_status,leg_count FROM tickets WHERE job_id=$1',[created.jobId])).toEqual({generation_status:'COMPLETED',leg_count:2});
      expect(calls.length).toBeGreaterThan(0);
      // Cloudflare reads the saved catalog without fetching ESPN or calling a model.
      expect(await refreshStoredCatalog()).toMatchObject({status:'completed'});
      const saved=await storedCatalog();expect(saved.data.fixtures).toHaveLength(5);
      const before=calls.length;
      expect(await scheduledMaintenance(undefined)).toMatchObject({queued:0,wake:{status:'idle'}});
      expect(calls).toHaveLength(before);
      const native=await withDatabase(d1Database(binding),()=>one<{config:object;created_at:Date;recovered:boolean}>('SELECT config,created_at,claim_recovered AS recovered FROM ticket_generation_jobs WHERE id=$1',[created.jobId]));
      expect(native?.created_at).toBeInstanceOf(Date);
    }finally{setAiTransportForTests(null);setFixtureProviderForTests(null);setHistoryProviderForTests(null);}
  }));
});
