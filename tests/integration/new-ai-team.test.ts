import { afterAll, beforeEach, expect, it, vi } from 'vitest';
const previous=vi.hoisted(()=>{const key=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test-new-ai-team';return key;});
import { many, one } from '@/lib/db';
import { createCustomJob } from '@/lib/jobs/service';
import { jobAgents, jobThreshold } from '@/lib/jobs/pipeline';
import { _processOneForTests } from '@/lib/jobs/worker';
import { NEW_AI_PROFILES } from '@/lib/ai/new-agent-profiles';
import { VOTER_IDS } from '@/lib/agent-roster';
import { clearFakes, closePool, demoFixtures, installFakes, makeUser, resetDb } from './helpers';
beforeEach(resetDb);afterAll(async()=>{clearFakes();await closePool();if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;});
it('runs and records all ten new voting models through the existing pipeline without changing the ticket slot count',async()=>{
  const ai={calls:[],pick:()=> '1X2:HOME'};installFakes(demoFixtures(1,()=>({home:1.4,draw:4,away:6,dc:1.25})),ai);
  const user=await makeUser();const created=await createCustomJob(user,{target:1.4,legs:1,agents:NEW_AI_PROFILES.map(a=>a.id),fromHours:2,toHours:48});
  for(let i=0;i<120;i++){const j=await one<{status:string}>('SELECT status FROM ticket_generation_jobs WHERE id=$1',[created.jobId]);if(['COMPLETED','INCOMPLETE','FAILED','PAUSED','NO_BET'].includes(j!.status))break;await _processOneForTests();}
  const predictions=await many<{agent_id:string;model_id:string}>('SELECT DISTINCT agent_id,model_id FROM agent_predictions WHERE job_id=$1',[created.jobId]);
  expect(predictions).toHaveLength(10);for(const a of NEW_AI_PROFILES)expect(predictions).toContainEqual({agent_id:a.id,model_id:a.model});
  const ticket=await one<{generation_status:string;summary:{agents:number;threshold:number}}>('SELECT generation_status,summary FROM tickets WHERE job_id=$1',[created.jobId]);
  expect(ticket).toMatchObject({generation_status:'COMPLETED',summary:{agents:10,threshold:3}});
  expect((await one<{n:number}>('SELECT count(*)::int n FROM ticket_generation_jobs'))!.n).toBe(1);
});
it('keeps old jobs on their historical roster while new full teams and custom subsets use the saved roster',()=>{
  const config={windowStart:'2026-10-25',windowDays:2,top10Only:false,maxFixtures:10,batchSize:2};
  expect(jobAgents({config})).toHaveLength(22);expect(jobThreshold({config})).toBe(6);
  expect(jobAgents({config:{...config,votingAgentIds:VOTER_IDS}})).toHaveLength(32);expect(jobThreshold({config:{...config,votingAgentIds:VOTER_IDS}})).toBe(9);
  expect(jobAgents({config:{...config,custom:{agents:['nova','orion'],target:2,legs:2,window:'48h'}}}).map(a=>a.id)).toEqual(['nova','orion']);
});
