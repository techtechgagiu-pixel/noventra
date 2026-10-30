import { afterAll, beforeEach, expect, it } from 'vitest';
import { many, one, query } from '@/lib/db';
import { createCustomJob } from '@/lib/jobs/service';
import { _processOneForTests } from '@/lib/jobs/worker';
import { persistFixtures } from '@/lib/sports/fixtures';
import { csFixture, type CsMatch } from '@/lib/cs/pandascore';
import { csQuote } from '@/lib/cs/markets';
import { teamKey } from '@/lib/cs/teams';
import { settlePending } from '@/lib/settlement';
import { agentStats } from '@/lib/agent-stats';
import { decidedPicks } from '@/lib/decided-picks';
import { clearFakes, closePool, demoFixtures, installFakes, makeUser, resetDb } from './helpers';

beforeEach(async () => { await resetDb(); clearFakes(); });
afterAll(async () => { clearFakes(); await closePool(); });

const team = (id: string, name: string) => ({ id, name, acronym: null, logo: null });
const match = (id: string, t1: ReturnType<typeof team>, t2: ReturnType<typeof team>, at: number, status = 'not_started', s1: number | null = null, s2: number | null = null): CsMatch =>
  ({ id, beginAt: new Date(at).toISOString(), status, bestOf: 3, team1: t1, team2: t2, score1: s1, score2: s2, winnerId: s1 !== null && s2 !== null ? (s1 > s2 ? t1.id : t2.id) : null, league: 'BLAST', serie: 'Fall', tournament: 'BLAST Premier', tier: 'a' });

async function seed() {
  const spirit = team('1', 'Team Spirit'), vit = team('2', 'Vitality'), mouz = team('3', 'MOUZ'), g2 = team('4', 'G2 Esports'), opp = team('9', 'Sparring');
  const past: CsMatch[] = [];
  let n = 100;
  for (const t of [spirit, vit, mouz, g2]) for (let i = 1; i <= 5; i++) past.push(match(String(n++), t, opp, Date.now() - i * 2 * 86400_000, 'finished', i % 2 ? 2 : 1, i % 2 ? 0 : 2));
  for (const m of past) await query(`INSERT INTO cs_matches(id,begin_at,status,best_of,team1_id,team1,team2_id,team2,score1,score2,winner_id,tournament,tier) VALUES($1,$2,$3,3,$4,$5,$6,$7,$8,$9,$10,'Online','b')`,
    [m.id, m.beginAt, m.status, m.team1.id, m.team1.name, m.team2.id, m.team2.name, m.score1, m.score2, m.winnerId]);
  for (const [name, rank, points] of [['Spirit', 1, 2046], ['Vitality', 3, 1911], ['MOUZ', 4, 1863], ['G2', 5, 1847]] as const)
    await query('INSERT INTO cs_rankings(team_key,team,rank,points,roster,as_of) VALUES($1,$2,$3,$4,$5,$6)', [teamKey(name), name, rank, points, 'a, b, c, d, e', '2026_10_05']);
  const upcoming = [match('900', spirit, vit, Date.now() + 6 * 3600_000), match('901', mouz, g2, Date.now() + 8 * 3600_000)];
  for (const m of upcoming) await query(`INSERT INTO cs_matches(id,begin_at,status,best_of,team1_id,team1,team2_id,team2,tournament,tier) VALUES($1,$2,'not_started',3,$3,$4,$5,$6,'BLAST Premier','a')`, [m.id, m.beginAt, m.team1.id, m.team1.name, m.team2.id, m.team2.name]);
  const now = new Date().toISOString();
  await persistFixtures(upcoming.map((m) => ({ ...csFixture(m), odds: { bookmaker: 'OddsPapi · mediana a 12 case', source: 'oddspapi', observedAt: now, providerUpdatedAt: now,
    markets: [['ML:HOME', 1.35], ['ML:AWAY', 3.1], ['MH:HOME:-1.5', 2.2], ['MH:AWAY:1.5', 1.62], ['MT:OVER:2.5', 2.05], ['MT:UNDER:2.5', 1.72]].map(([k, o]) => csQuote(k as string, o as number, m.team1.name, m.team2.name)) } })));
}
async function drain(id: string) { for (let i = 0; i < 200; i++) { const j = await one<{ status: string }>('SELECT status FROM ticket_generation_jobs WHERE id=$1', [id]); if (['COMPLETED', 'INCOMPLETE', 'NO_BET', 'FAILED', 'PAUSED'].includes(j!.status)) return j!.status; await _processOneForTests(); } throw Error('Not terminal'); }

it('builds a Counter-Strike ticket from stored data and settles it from the map score', async () => {
  installFakes(demoFixtures(3), { calls: [], pick: (id) => (id.startsWith('ps:') ? 'ML:HOME' : '1X2:HOME') });
  await seed();
  const user = await makeUser();
  const r = await createCustomJob(user, { target: 1.8, legs: 2, agents: ['andrei', 'alex', 'ioana'], fromHours: 2, toHours: 48, leagues: ['CS2'] });
  expect(await drain(r.jobId)).toBe('COMPLETED');
  const legs = await many<{ fixture_id: string; market_key: string; market_label: string; odds: number }>('SELECT s.fixture_id,s.market_key,s.market_label,CAST(s.odds AS DOUBLE PRECISION) AS odds FROM ticket_selections s JOIN tickets t ON t.id=s.ticket_id WHERE t.job_id=$1 ORDER BY s.position', [r.jobId]);
  expect(legs.map((l) => [l.fixture_id, l.market_key, l.market_label])).toEqual([['ps:900', 'ML:HOME', 'Team Spirit câștigă meciul'], ['ps:901', 'ML:HOME', 'MOUZ câștigă meciul']]);
  const snap = await one<{ payload: { cs: { home: { rank: number }; bestOf: number }; dataQuality: { historyHome: number }; brief: { sport: string } } }>("SELECT payload FROM fixture_snapshots WHERE job_id=$1 AND fixture_id='ps:900'", [r.jobId]);
  expect(snap!.payload).toMatchObject({ cs: { home: { rank: 1 }, bestOf: 3 }, dataQuality: { historyHome: 5 }, brief: { sport: 'cs2' } });
  // Map score 2-1 for both home teams → the ticket wins.
  await query("UPDATE fixtures SET status='post',home_score=2,away_score=1 WHERE provider='pandascore'");
  await settlePending();
  expect(await one('SELECT outcome_status FROM tickets WHERE job_id=$1', [r.jobId])).toEqual({ outcome_status: 'WON' });
  // Separate statistics: the CS picks count only in the Counter-Strike view, never in the football records.
  const cs = await agentStats(user, false, 'all', 'all', 'cs');
  const football = await agentStats(user, false, 'all', 'all', 'football');
  const andreiCs = cs.agents.find((x) => x.id === 'andrei')!, andreiFootball = football.agents.find((x) => x.id === 'andrei')!;
  expect(andreiCs.bets + andreiCs.excluded.won + andreiCs.excluded.lost).toBeGreaterThan(0);
  expect(andreiFootball.bets + andreiFootball.excluded.won + andreiFootball.excluded.lost).toBe(0);
  expect((await decidedPicks(true)).some((p) => /^(ML|MH|MT):/.test(p.market_key ?? ''))).toBe(false);
});

it('never puts Counter-Strike on a football ticket unless CS2 is ticked', async () => {
  installFakes(demoFixtures(3), { calls: [], pick: () => '1X2:HOME' });
  await seed();
  const user = await makeUser();
  const r = await createCustomJob(user, { target: 2, legs: 2, agents: ['andrei', 'alex', 'ioana'], fromHours: 2, toHours: 48 });
  await drain(r.jobId);
  const order = await one<{ candidate_order: Array<{ fixtureId: string }> }>('SELECT candidate_order FROM ticket_generation_jobs WHERE id=$1', [r.jobId]);
  expect(order!.candidate_order.some((c) => c.fixtureId.startsWith('ps:'))).toBe(false);
});
