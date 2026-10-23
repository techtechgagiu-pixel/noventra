import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { many, one, query } from '@/lib/db';
import { persistFixtures } from '@/lib/sports/fixtures';
import { espnLeagueDay, espnSummary } from '@/lib/sports/espn';
import { settlePending } from '@/lib/settlement';
import { listTickets, ticketDetail } from '@/lib/views';
import { demoFixtures, closePool, makeUser, resetDb } from './helpers';
import { localDate, yyyymmdd } from '@/lib/time';

vi.mock('@/lib/sports/espn', () => ({ espnLeagueDay: vi.fn(async () => []), espnSummary: vi.fn(async () => ({})) }));
beforeEach(async () => { await resetDb(); vi.clearAllMocks(); });
afterAll(closePool);

async function savedTicket() {
  const user = await makeUser();
  const f = { ...demoFixtures(1)[0], id: 'espn:123', provider: 'espn' as const, providerId: '123', kickoff: new Date(Date.now() - 4 * 3600_000).toISOString(), odds: null };
  await persistFixtures([f]);
  const job = (await one<{ id: string }>(`INSERT INTO ticket_generation_jobs (user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES ($1,'FIVE_A',current_date,5,'s','{}','{}','COMPLETED','DONE') RETURNING id`, [user]))!.id;
  const ticket = (await one<{ id: string }>(`INSERT INTO tickets (job_id,user_id,slot,period_key,target_odds,actual_odds,leg_count,generation_status,summary) VALUES ($1,$2,'FIVE_A',current_date,5,1.5,1,'COMPLETED','{}') RETURNING id`, [job, user]))!.id;
  await query(`INSERT INTO ticket_selections (ticket_id,fixture_id,position,market_key,market_label,odds,bookmaker,quote_observed_at,votes_for,risk,snapshot) VALUES ($1,$2,1,'1X2:HOME','DEMO Home wins',1.5,'DEMO',now(),6,'LOW',$3)`, [ticket, f.id, JSON.stringify({ match: 'DEMO Home – DEMO Away', kickoff: f.kickoff })]);
  await query(`INSERT INTO agent_predictions (job_id,fixture_id,agent_id,round,provider,model_id,prompt_version,decision,market_key,payload) VALUES ($1,$2,'victor',0,'demo','demo','v1','BET_CANDIDATE','1X2:HOME','{}')`, [job, f.id]);
  return { user, ticket, f };
}

it('keeps live scores pending, then updates archive, detail and agent outcomes from the confirmed final score', async () => {
  const { user, ticket, f } = await savedTicket();
  await query(`UPDATE fixtures SET status='in',home_score=2,away_score=0 WHERE id=$1`, [f.id]);
  await settlePending();
  expect((await ticketDetail(user, ticket))!.outcomeStatus).toBe('PENDING');

  await query(`UPDATE fixtures SET status='post',home_score=0,away_score=1 WHERE id=$1`, [f.id]);
  await settlePending();
  expect((await listTickets(user))[0]).toMatchObject({ outcome_status: 'LOST', selections: [{ outcome: 'LOST', odds: 1.5 }] });
  expect((await ticketDetail(user, ticket))).toMatchObject({ outcomeStatus: 'LOST', actualOdds: 1.5, selections: [{ outcome: 'LOST', home_score: 0, away_score: 1 }] });
  expect(await many(`SELECT outcome FROM agent_predictions`)).toEqual([{ outcome: 'LOST' }]);
  const before = await one(`SELECT settled_at FROM tickets WHERE id=$1`, [ticket]);
  await settlePending();
  expect(await one(`SELECT settled_at FROM tickets WHERE id=$1`, [ticket])).toEqual(before);
});

it('finds a final score filed under the preceding ESPN day and settles it green', async () => {
  const { user, ticket, f } = await savedTicket();
  const day = localDate(new Date(f.kickoff));
  const previous = new Date(`${day}T12:00:00Z`); previous.setUTCDate(previous.getUTCDate() - 1);
  const previousKey = yyyymmdd(previous.toISOString().slice(0, 10));
  vi.mocked(espnLeagueDay).mockImplementation(async (_league, date) => date === previousKey ? [{ ...f, status: 'post', homeScore: 2, awayScore: 1 }] : []);
  await settlePending();
  expect(vi.mocked(espnLeagueDay).mock.calls.map((c) => c[1])).toEqual([yyyymmdd(day), previousKey]);
  expect((await ticketDetail(user, ticket))!.outcomeStatus).toBe('WON');
});

it('waits for missing half-time facts instead of guessing from the final score', async () => {
  const { user, ticket, f } = await savedTicket();
  await query(`UPDATE ticket_selections SET market_key='HTTOT:OVER:0.5' WHERE ticket_id=$1`, [ticket]);
  await query(`UPDATE fixtures SET status='post',home_score=2,away_score=1 WHERE id=$1`, [f.id]);
  await settlePending();
  expect(espnSummary).toHaveBeenCalled();
  expect((await ticketDetail(user, ticket))!.selections[0].outcome).toBe('PENDING');
  await query(`UPDATE fixtures SET ht_home=1,ht_away=0 WHERE id=$1`, [f.id]);
  await settlePending();
  expect((await ticketDetail(user, ticket))!.outcomeStatus).toBe('WON');
});

it('keeps a stale catalog response from reverting a confirmed result and applies a later official score correction', async () => {
  const { user, ticket, f } = await savedTicket();
  const observed = new Date().toISOString();
  await persistFixtures([{ ...f, status: 'post', homeScore: 2, awayScore: 0, fetchedAt: observed }]);
  await settlePending();
  expect((await ticketDetail(user, ticket))!.outcomeStatus).toBe('WON');
  await persistFixtures([{ ...f, status: 'in', homeScore: 1, awayScore: 0, fetchedAt: new Date(Date.now() + 1).toISOString() }]);
  expect(await one('SELECT status,home_score FROM fixtures WHERE id=$1', [f.id])).toEqual({ status: 'post', home_score: 2 });
  await persistFixtures([{ ...f, status: 'post', homeScore: 0, awayScore: 1, fetchedAt: new Date(Date.now() + 2).toISOString() }]);
  await settlePending();
  expect((await ticketDetail(user, ticket))!.outcomeStatus).toBe('LOST');
  expect(await one('SELECT outcome FROM agent_predictions WHERE fixture_id=$1', [f.id])).toEqual({ outcome: 'LOST' });
});

it('refreshes started fixtures during play instead of waiting two hours, without settling live goals',async()=>{
  const {user,ticket,f}=await savedTicket();
  const kickoff=new Date(Date.now()-15*60_000).toISOString();
  await query('UPDATE fixtures SET kickoff_utc=$2 WHERE id=$1',[f.id,kickoff]);
  vi.mocked(espnLeagueDay).mockResolvedValue([{...f,kickoff,status:'in',homeScore:2,awayScore:0}]);
  await settlePending();
  expect(espnLeagueDay).toHaveBeenCalled();
  expect(await one('SELECT status FROM fixtures WHERE id=$1',[f.id])).toEqual({status:'in'});
  expect((await ticketDetail(user,ticket))!.selections[0].outcome).toBe('PENDING');
  expect(await one('SELECT outcome FROM agent_predictions WHERE fixture_id=$1',[f.id])).toEqual({outcome:null});
});

it('repairs mismatched agent and ticket outcomes from confirmed scores even with recent settlement stamps',async()=>{
  const {user,ticket,f}=await savedTicket();
  await query(`UPDATE fixtures SET status='post',home_score=2,away_score=0 WHERE id=$1`,[f.id]);
  await query(`UPDATE agent_predictions SET outcome='LOST',settled_at=now()`);
  await query(`UPDATE ticket_selections SET outcome='LOST',settled_at=now()`);
  await query(`UPDATE tickets SET outcome_status='LOST',settled_at=now()`);
  const r=await settlePending();
  expect(r).toMatchObject({status:'completed',detail:{predictionsChanged:1,selectionsChanged:1,ticketsChanged:1}});
  expect((await ticketDetail(user,ticket))).toMatchObject({outcomeStatus:'WON',actualOdds:1.5,selections:[{outcome:'WON'}],predictions:[{outcome:'WON',current_in_stats:true}]});
});

it('reconciles a stale ticket total when every leg was already correct',async()=>{
  const {user,ticket,f}=await savedTicket();
  await query(`UPDATE fixtures SET status='post',home_score=2,away_score=0 WHERE id=$1`,[f.id]);
  await settlePending();
  await query(`UPDATE tickets SET outcome_status='LOST' WHERE id=$1`,[ticket]);
  expect(await settlePending()).toMatchObject({status:'completed',detail:{selectionsChanged:0,ticketsChanged:1}});
  expect((await ticketDetail(user,ticket))!.outcomeStatus).toBe('WON');
});
