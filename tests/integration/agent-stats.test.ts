import { afterAll, beforeEach, expect, it } from 'vitest';
import { query, one } from '@/lib/db';
import { agentStats, agentHistory, agentRanking } from '@/lib/agent-stats';
import { topSixAgentIds } from '@/lib/agent-ranking';
import { agentTrackRecord, allTrackRecords } from '@/lib/track-record';
import { persistFixtures } from '@/lib/sports/fixtures';
import { closePool, resetDb, makeUser, demoFixtures } from './helpers';

beforeEach(resetDb);
afterAll(closePool);
async function pick(user: string, fixture: string, at: string, round: number, decision: string, outcome: string | null, existingJob?: string) {
  const count = await one<{ n: number }>('SELECT count(*)::int AS n FROM ticket_generation_jobs WHERE user_id=$1', [user]);
  const job = existingJob ?? (await one<{ id: string }>(`INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES ($1,$2,current_date,5,'test','{}','{}','COMPLETED','DONE') RETURNING id`, [user, `CUSTOM_${(count?.n ?? 0) + 1}`]))!.id;
  await query(`INSERT INTO agent_predictions(job_id,fixture_id,agent_id,round,provider,model_id,prompt_version,decision,market_key,odds,payload,outcome,created_at) VALUES ($1,$2,'robert',$3,'demo','demo','v1',$4,$5,1.5,'{}',$6,$7)`, [job, fixture, round, decision, decision === 'NO_BET' ? null : '1X2:HOME', outcome, at]);
  return job;
}

it('uses the match calendar, deduplicates repeated analyses, and matches the shared track record', async () => {
  const user = await makeUser();
  const f = { ...demoFixtures(1)[0], kickoff: '2026-10-24T13:30:00Z' };
  await persistFixtures([f]);
  await pick(user, f.id, '2026-10-20T08:00:00Z', 0, 'BET_CANDIDATE', 'WON');
  await pick(user, f.id, '2026-10-21T08:00:00Z', 0, 'BET_CANDIDATE', 'LOST');
  const r = (await agentStats(user, true, '2026-10')).agents.find((a) => a.id === 'robert')!;
  expect(r).toMatchObject({ bets: 1, lost: 1, won: 0, recent: [{ kickoff: '2026-10-24T13:30:00.000Z', at: '2026-10-21T08:00:00.000Z', fixtureId: f.id }] });
  expect(await agentTrackRecord('robert')).toMatchObject({ decided: 1, won: 0 });
  expect((await allTrackRecords(['robert']))[0].record).toMatchObject({ decided: 1, won: 0 });
});

it('never revives an earlier winning round or an earlier analysis after a final NO_BET', async () => {
  const user = await makeUser(); const f = demoFixtures(1)[0]; await persistFixtures([f]);
  const job = await pick(user, f.id, '2026-10-20T08:00:00Z', 0, 'BET_CANDIDATE', 'WON');
  await pick(user, f.id, '2026-10-20T09:00:00Z', 1, 'NO_BET', null, job);
  expect(await agentTrackRecord('robert')).toBeNull();
  const r = (await agentStats(user, false, 'all')).agents.find((a) => a.id === 'robert')!;
  expect(r).toMatchObject({ bets: 0, noBet: 1, won: 0 });
});

it('makes community and personal scopes explicit and groups a midnight match by its Romanian month', async () => {
  const a = await makeUser('a@test.local'), b = await makeUser('b@test.local');
  const f = { ...demoFixtures(1)[0], kickoff: '2026-10-31T22:30:00Z' }; await persistFixtures([f]);
  await pick(a, f.id, '2026-10-20T08:00:00Z', 0, 'BET_CANDIDATE', 'WON');
  await pick(b, f.id, '2026-10-21T08:00:00Z', 0, 'BET_CANDIDATE', 'LOST');
  const agent = async (month: string, scope: 'all' | 'mine') => (await agentStats(a, false, month, scope)).agents.find((x) => x.id === 'robert')!;
  expect(await agent('2026-10', 'all')).toMatchObject({ bets: 0, career: { won: 0, lost: 1 } });
  expect(await agent('2026-11', 'all')).toMatchObject({ bets: 1, lost: 1, career: { won: 0, lost: 1 } });
  expect(await agent('2026-11', 'mine')).toMatchObject({ bets: 1, won: 1, career: { won: 1, lost: 0 } });
});

it('uses only decided picks for average odds/probability and exposes all final positions in history', async () => {
  const user=await makeUser(); const fs=demoFixtures(3); await persistFixtures(fs);
  const j=await pick(user,fs[0].id,'2026-10-20T08:00:00Z',0,'BET_CANDIDATE','WON');
  await pick(user,fs[1].id,'2026-10-20T09:00:00Z',0,'BET_CANDIDATE',null,j);
  await pick(user,fs[2].id,'2026-10-20T10:00:00Z',0,'NO_BET',null,j);
  await query(`UPDATE agent_predictions SET odds=CASE WHEN fixture_id=$1 THEN 1.4 ELSE 3.0 END,estimated_probability=CASE WHEN fixture_id=$1 THEN 0.7 ELSE 0.3 END WHERE decision='BET_CANDIDATE'`,[fs[0].id]);
  const r=(await agentStats(user,false,'all')).agents.find((a)=>a.id==='robert')!;
  expect(r).toMatchObject({bets:2,won:1,lost:0,pending:1,noBet:1,avgOdds:1.4,avgEstimated:0.7});
  expect(r.recent).toHaveLength(3);
  expect(r.recent[0]).toMatchObject({decision:'NO_BET',round:0});
  expect((await allTrackRecords(['robert']))[0].record).toMatchObject({decided:1,avgOdds:r.avgOdds,avgEstimated:r.avgEstimated});
});

it('does not silently cap the display record at 200 matches',async()=>{
  const user=await makeUser();const fs=demoFixtures(205);await persistFixtures(fs);
  const job=await pick(user,fs[0].id,'2026-10-20T08:00:00Z',0,'BET_CANDIDATE','WON');
  await query(`INSERT INTO agent_predictions(job_id,fixture_id,agent_id,round,provider,model_id,prompt_version,decision,market_key,odds,payload,outcome)
    SELECT $1,id,'robert',0,'demo','demo','v1','BET_CANDIDATE','1X2:HOME',1.5,'{}','WON' FROM fixtures WHERE id<>$2`,[job,fs[0].id]);
  expect((await allTrackRecords(['robert']))[0].record).toMatchObject({decided:205,won:205});
  expect((await agentStats(user,false,'all')).agents.find((a)=>a.id==='robert')).toMatchObject({bets:205,won:205,recent:expect.any(Array)});
  expect(await agentHistory(user,'robert','all','all')).toHaveLength(205);
});

it('loads one agent history with exactly the selected month and ownership scope', async () => {
  const a=await makeUser('history-a@test.local'),b=await makeUser('history-b@test.local');
  const f={...demoFixtures(1)[0],kickoff:'2026-10-31T22:30:00Z'};await persistFixtures([f]);
  await pick(a,f.id,'2026-10-20T08:00:00Z',0,'BET_CANDIDATE','WON');
  await pick(b,f.id,'2026-10-21T08:00:00Z',0,'NO_BET',null);
  for(const scope of ['mine','all'] as const){
    const stats=(await agentStats(a,false,'2026-11',scope)).agents.find(x=>x.id==='robert')!;
    expect(await agentHistory(a,'robert','2026-11',scope)).toEqual(stats.recent);
  }
  expect(await agentHistory(a,'robert','2026-10','all')).toEqual([]);
  expect(await agentHistory(a,'victor','all','all')).toEqual([]);
});

it('keeps the lightweight Custom ranking identical to Statistics including pending picks and ties',async()=>{
  const user=await makeUser();const fs=demoFixtures(3).map(f=>({...f,kickoff:'2026-10-24T12:00:00Z'}));await persistFixtures(fs);
  const job=await pick(user,fs[0].id,'2026-10-20T08:00:00Z',0,'BET_CANDIDATE','WON');
  await pick(user,fs[1].id,'2026-10-20T09:00:00Z',0,'BET_CANDIDATE',null,job);
  await query(`INSERT INTO agent_predictions(job_id,fixture_id,agent_id,round,provider,model_id,prompt_version,decision,market_key,odds,payload,outcome) VALUES($1,$2,'victor',0,'demo','demo','v1','BET_CANDIDATE','1X2:HOME',1.5,'{}','WON')`,[job,fs[2].id]);
  for(const month of ['2026-10','2026-11','all']) {
    const stats=(await agentStats(user,false,month)).agents;
    const ranking=await agentRanking(month);
    expect(topSixAgentIds(ranking)).toEqual(topSixAgentIds(stats));
    for(const r of ranking)expect(r).toEqual(Object.fromEntries(Object.keys(r).map(k=>[k,stats.find(a=>a.id===r.id)![k as keyof typeof stats[number]]])));
  }
});
