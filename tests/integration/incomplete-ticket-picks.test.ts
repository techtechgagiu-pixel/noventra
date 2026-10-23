import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { many, one, query } from '@/lib/db';
import { listTickets, ticketDetail } from '@/lib/views';
import { ticketPerformance } from '@/lib/ticket-performance';
import { persistFixtures } from '@/lib/sports/fixtures';
import { settlePending } from '@/lib/settlement';
import { espnLeagueDay, espnSummary } from '@/lib/sports/espn';
import { closePool, demoFixtures, makeUser, resetDb } from './helpers';

vi.mock('@/lib/sports/espn', () => ({ espnLeagueDay: vi.fn(async () => []), espnSummary: vi.fn(async () => ({})) }));
beforeEach(async () => { await resetDb(); vi.clearAllMocks(); });
afterAll(closePool);

async function incomplete() {
  const user = await makeUser();
  const job = (await one<{ id: string }>(`INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES($1,'CUSTOM_1',current_date,50,'partial','{}','{}','INCOMPLETE','DONE') RETURNING id`, [user]))!.id;
  const ticket = (await one<{ id: string }>(`INSERT INTO tickets(job_id,user_id,slot,period_key,target_odds,leg_count,generation_status,outcome_status,summary) VALUES($1,$2,'CUSTOM_1',current_date,50,0,'INCOMPLETE','NOT_APPLICABLE','{}') RETURNING id`, [job,user]))!.id;
  return { user, job, ticket };
}
async function candidate(job: string, f: ReturnType<typeof demoFixtures>[number], market = 'DC:1X', outcome = 'QUALIFIED') {
  await persistFixtures([f]);
  await query(`INSERT INTO final_decisions(job_id,fixture_id,outcome,market_key,votes_for,votes,validation,reason) VALUES($1,$2,$3,$4,4,'[]',$5,'DEMO saved consensus')`, [job,f.id,outcome,market,JSON.stringify({ currentOdds: 1.4, observedAt: new Date().toISOString(), bookmaker: 'DEMO' })]);
  await query(`INSERT INTO fixture_snapshots(job_id,fixture_id,payload,data_quality) VALUES($1,$2,$3,'{}')`, [job,f.id,JSON.stringify({ fixture: f, model: { markets: [{key:market,label:'DEMO saved selection',estimatedProbability:.75}] }, odds: { source: 'DEMO' } })]);
}

it('recovers old incomplete candidates in archive and detail, resolves confirmed results, and never finalizes them', async () => {
  const { user, job, ticket } = await incomplete();
  const fixtures = demoFixtures(4).map((f,i) => ({ ...f, kickoff: new Date(Date.now()-2*3600_000).toISOString(), status: (i===2?'in':i===3?'cancelled':'post') as typeof f.status, homeScore: i===1?0:2, awayScore: i===1?2:0 }));
  for (const f of fixtures) await candidate(job,f);
  await candidate(job, { ...fixtures[0], id:'demo:rejected', providerId:'rejected' }, 'DC:1X', 'REJECTED');
  const archive = (await listTickets(user))[0];
  const detail = (await ticketDetail(user,ticket))!;
  expect(archive.partialSelections.map(s=>s.outcome)).toEqual(['WON','LOST','PENDING','VOID']);
  expect(detail.partialSelections).toEqual(archive.partialSelections);
  expect(detail.partialSelections).toHaveLength(4);
  expect(detail).toMatchObject({ generationStatus:'INCOMPLETE', outcomeStatus:'NOT_APPLICABLE', actualOdds:null, legCount:0, selections:[] });
  expect(await many('SELECT * FROM ticket_selections')).toHaveLength(0);
  const performance = ticketPerformance([archive as never]);
  expect(performance.tickets).toMatchObject({ completed:0, incomplete:1, won:0, lost:0, units:0 });
  expect(performance.selections).toHaveLength(0);
  await query("UPDATE fixtures SET home_score=0,away_score=3 WHERE id=$1",[fixtures[0].id]);
  expect((await ticketDetail(user,ticket))!.partialSelections[0].outcome).toBe('LOST');
  await query("UPDATE tickets SET generation_status='NO_BET' WHERE id=$1",[ticket]);
  expect((await listTickets(user))[0].partialSelections).toEqual([]);
});

it('automatically refreshes scores and extra facts for incomplete candidates even without saved agent predictions', async () => {
  const {user,job,ticket}=await incomplete();
  const f={...demoFixtures(1)[0],id:'espn:incomplete-refresh',provider:'espn' as const,providerId:'incomplete-refresh',kickoff:new Date(Date.now()-2*3600_000).toISOString(),odds:null};
  await candidate(job,f,'HTTOT:OVER:0.5');
  expect((await ticketDetail(user,ticket))!.partialSelections[0].outcome).toBe('PENDING');
  vi.mocked(espnLeagueDay).mockResolvedValue([{...f,status:'post',homeScore:2,awayScore:0}]);
  vi.mocked(espnSummary).mockResolvedValue({header:{competitions:[{competitors:[{homeAway:'home',linescores:[{value:1}]},{homeAway:'away',linescores:[{value:0}]}]}]}});
  await settlePending();
  expect(espnLeagueDay).toHaveBeenCalled();
  expect(espnSummary).toHaveBeenCalled();
  expect((await ticketDetail(user,ticket))!.partialSelections[0]).toMatchObject({outcome:'WON',home_score:2,away_score:0});
  expect(await one('SELECT generation_status,outcome_status,leg_count,actual_odds FROM tickets WHERE id=$1',[ticket])).toEqual({generation_status:'INCOMPLETE',outcome_status:'NOT_APPLICABLE',leg_count:0,actual_odds:null});
});

it('stops fetching expired extra facts and long-postponed incomplete matches once their outcome is void', async () => {
  const {user,job,ticket}=await incomplete();
  for (const [i,status] of ['post','postponed'].entries()) {
    await candidate(job,{...demoFixtures(1)[0],id:`espn:old-partial-${i}`,provider:'espn',providerId:`old-partial-${i}`,kickoff:new Date(Date.now()-80*3600_000).toISOString(),status:status as 'post'|'postponed',homeScore:status==='post'?2:null,awayScore:status==='post'?0:null,odds:null},'HTTOT:OVER:0.5');
  }
  await settlePending();
  expect(espnLeagueDay).not.toHaveBeenCalled();
  expect(espnSummary).not.toHaveBeenCalled();
  expect((await ticketDetail(user,ticket))!.partialSelections.map(p=>p.outcome)).toEqual(['VOID','VOID']);
});
