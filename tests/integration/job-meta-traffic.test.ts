import { afterAll, beforeEach, expect, it } from 'vitest';
import { one } from '@/lib/db';
import { jobMeta } from '@/lib/views';
import { closePool, makeUser, resetDb } from './helpers';
beforeEach(resetDb);afterAll(closePool);
it('returns the same progress counters without exposing the large worker checkpoint in each metadata poll',async()=>{
  const user=await makeUser();
  const cp={batches:[['demo:0','demo:1'],['demo:2']],batchIndex:1,analyzed:2,qualified:1,brain:{large:'DEMO '.repeat(20000)}};
  const job=(await one<{id:string}>("INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES($1,'CUSTOM_1',current_date,5,'demo','{}',$2,'RUNNING','ANALYSIS') RETURNING id",[user,JSON.stringify(cp)]))!.id;
  const meta=await jobMeta(user,job);expect(meta).toMatchObject({batches:2,batchIndex:1,analyzed:2,qualified:1});expect(JSON.stringify(meta).length).toBeLessThan(2000);expect(meta).not.toHaveProperty('checkpoint');
});
