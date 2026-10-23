import { afterAll,beforeEach,expect,it,vi } from 'vitest';
import { many,one,query } from '@/lib/db';
import { matchList } from '@/lib/catalog';
import { loadFixtures,persistFixtures } from '@/lib/sports/fixtures';
import { homeStats } from '@/lib/home-reel';
import { demoFixtures,closePool,makeUser,resetDb } from './helpers';
vi.mock('@/lib/sports/fixtures',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/sports/fixtures')>(),loadFixtures:vi.fn()}));
beforeEach(resetDb);afterAll(closePool);
it('shows shared ticket annotations and confirmed DB scores even while the source catalog is still cached live',async()=>{
 const owner=await makeUser('owner@test.local'),viewer=await makeUser('viewer@test.local');
 const f={...demoFixtures(1)[0],id:'espn:catalog-audit',provider:'espn' as const,providerId:'catalog-audit',status:'in' as const,homeScore:1,awayScore:0};
 await persistFixtures([f]);
 vi.mocked(loadFixtures).mockResolvedValue({fixtures:[f],errors:[],leagues:[],days:[new Date().toISOString().slice(0,10)],fetchedAt:new Date().toISOString()});
 const j=(await one<{id:string}>(`INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES($1,'FIVE_A',current_date,5,'catalog','{}','{}','COMPLETED','DONE') RETURNING id`,[owner]))!.id;
 const t=(await one<{id:string}>(`INSERT INTO tickets(job_id,user_id,slot,period_key,target_odds,actual_odds,leg_count,generation_status,summary) VALUES($1,$2,'FIVE_A',current_date,5,1.5,1,'COMPLETED','{}') RETURNING id`,[j,owner]))!.id;
 await query(`INSERT INTO final_decisions(job_id,fixture_id,outcome,market_key,votes_for,votes,validation,reason) VALUES($1,$2,'QUALIFIED','1X2:HOME',6,'[]','{}','demo')`,[j,f.id]);
 await query(`INSERT INTO fixture_snapshots(fixture_id,job_id,payload,data_quality) VALUES($1,$2,$3,'{}')`,[f.id,j,JSON.stringify({model:{markets:[{key:'1X2:HOME',label:'Saved match market'}]}})]);
 // A team selection can come from an implied market absent from individual predictions.
 expect((await matchList(viewer)).rows[0].analysis).toMatchObject({onTicket:false,label:'Saved match market'});
 await query(`INSERT INTO ticket_selections(ticket_id,fixture_id,position,market_key,market_label,odds,bookmaker,quote_observed_at,votes_for,risk,snapshot) VALUES($1,$2,1,'1X2:HOME','DEMO Home wins',1.5,'DEMO',now(),6,'LOW','{}')`,[t,f.id]);
 expect((await matchList(viewer)).rows[0]).toMatchObject({status:'in',analysis:{onTicket:true}});
 expect((await matchList(viewer,'mine')).rows[0].analysis).toBeNull();
 await query(`UPDATE fixtures SET status='post',home_score=2,away_score=0 WHERE id=$1`,[f.id]);
 expect((await matchList(viewer)).rows[0]).toMatchObject({status:'post',score:'2–0'});
 expect((await homeStats(viewer)).tickets).toBe((await many('SELECT id FROM tickets')).length);
});
