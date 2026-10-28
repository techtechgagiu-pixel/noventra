import { afterAll, beforeEach, expect, it } from 'vitest';
import { one, query } from '@/lib/db';
import { persistFixtures } from '@/lib/sports/fixtures';
import { publicProof } from '@/lib/public-proof';
import { demoFixtures, closePool, makeUser, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(closePool);

let n = 0;
async function ticket(user: string, outcome: 'WON' | 'LOST', legs: Array<{ fixture: string; outcome: 'WON' | 'LOST' }>, opts: { hidden?: boolean; settled?: string } = {}) {
  const job = (await one<{ id: string }>(`INSERT INTO ticket_generation_jobs (user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES ($1,$2,current_date,3,'s','{}','{}','COMPLETED','DONE') RETURNING id`, [user, `CUSTOM_${++n}`]))!.id;
  const t = (await one<{ id: string }>(`INSERT INTO tickets (job_id,user_id,slot,period_key,target_odds,actual_odds,leg_count,generation_status,outcome_status,summary,settled_at,hidden_at) VALUES ($1,$2,'CUSTOM_1',current_date,3,2.25,$3,'COMPLETED',$4,'{}',$5,$6) RETURNING id`,
    [job, user, legs.length, outcome, opts.settled ?? new Date().toISOString(), opts.hidden ? new Date().toISOString() : null]))!.id;
  let i = 0;
  for (const l of legs) await query(`INSERT INTO ticket_selections (ticket_id,fixture_id,position,market_key,market_label,odds,bookmaker,quote_observed_at,votes_for,risk,snapshot,outcome) VALUES ($1,$2,$3,'1X2:HOME','DEMO Home wins',1.5,'DEMO',now(),6,'LOW','{}',$4)`, [t, l.fixture, ++i, l.outcome]);
  return t;
}

it('shows the latest visible won ticket with real scores and honest totals, never hidden tickets', async () => {
  const user = await makeUser();
  const fx = demoFixtures(3).map((f, i) => ({ ...f, id: `espn:${900 + i}`, provider: 'espn' as const, providerId: `${900 + i}`, odds: null }));
  await persistFixtures(fx);
  await query(`UPDATE fixtures SET status='post',home_score=2,away_score=1`);
  await ticket(user, 'WON', [{ fixture: fx[0].id, outcome: 'WON' }], { settled: '2026-10-20T20:00:00Z' });
  await ticket(user, 'WON', [{ fixture: fx[1].id, outcome: 'WON' }, { fixture: fx[2].id, outcome: 'WON' }], { settled: '2026-10-27T20:00:00Z' });
  await ticket(user, 'LOST', [{ fixture: fx[0].id, outcome: 'LOST' }], { settled: '2026-10-28T08:00:00Z' });
  await ticket(user, 'WON', [{ fixture: fx[1].id, outcome: 'WON' }], { settled: '2026-10-28T09:00:00Z', hidden: true });

  const p = await publicProof();
  expect(p?.lastWon?.legs).toHaveLength(2);
  expect(p?.lastWon).toMatchObject({ odds: 2.25, legs: [{ label: 'DEMO Home wins', odds: 1.5, homeScore: 2, awayScore: 1 }, {}] });
  expect(p?.wins.map((w) => w.legs.length)).toEqual([2, 1]);
  expect(p?.tickets).toEqual({ won: 2, settled: 3 });
  expect(p?.picks).toEqual({ won: 3, decided: 4 });
});

it('has no proof block when nothing has been won yet', async () => {
  expect((await publicProof())?.lastWon).toBeNull();
});
