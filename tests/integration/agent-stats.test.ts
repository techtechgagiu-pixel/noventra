import { afterAll, beforeEach, expect, it } from 'vitest';
import { query, one } from '@/lib/db';
import { agentStats } from '@/lib/agent-stats';
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
  expect(await agent('2026-10', 'all')).toMatchObject({ bets: 0 });
  expect(await agent('2026-11', 'all')).toMatchObject({ bets: 1, lost: 1 });
  expect(await agent('2026-11', 'mine')).toMatchObject({ bets: 1, won: 1 });
});
