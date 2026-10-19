import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { one, many } from '@/lib/db';
import { createOrGetJob, resumeJob, slotStates } from '@/lib/jobs/service';
import { _processOneForTests } from '@/lib/jobs/worker';
import { aiCallCount } from '@/lib/ai/router';
import { jobEvents, listTickets, ticketDetail } from '@/lib/views';
import { clearFakes, closePool, demoFixtures, installFakes, makeUser, resetDb, type FakeAi } from './helpers';

async function drain(jobId: string, max = 400) {
  for (let i = 0; i < max; i++) {
    const j = await one<{ status: string }>('SELECT status FROM ticket_generation_jobs WHERE id=$1', [jobId]);
    if (['COMPLETED', 'INCOMPLETE', 'NO_BET', 'FAILED', 'PAUSED'].includes(j!.status)) return j!.status;
    await one("UPDATE ticket_generation_jobs SET next_run_at=now() WHERE id=$1 AND status='WAITING'", [jobId]);
    await _processOneForTests();
  }
  throw new Error('job did not finish');
}

beforeEach(async () => { await resetDb(); clearFakes(); });
afterAll(async () => { clearFakes(); await closePool(); });

describe('slot locking', () => {
  it('concurrent CREEAZĂ BILETUL requests converge on ONE job (DB uniqueness)', async () => {
    installFakes(demoFixtures(6), { calls: [], pick: () => null });
    const u = await makeUser();
    const results = await Promise.all(Array.from({ length: 8 }, () => createOrGetJob(u, 'FIVE_A')));
    expect(new Set(results.map((r) => r.jobId)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    const n = await one<{ n: string }>('SELECT count(*) n FROM ticket_generation_jobs WHERE user_id=$1', [u]);
    expect(Number(n!.n)).toBe(1);
  });
  it('slots are independent per slot and per user', async () => {
    installFakes(demoFixtures(6), { calls: [], pick: () => null });
    const u1 = await makeUser('a@t'); const u2 = await makeUser('b@t');
    const a = await createOrGetJob(u1, 'FIVE_A'); const b = await createOrGetJob(u1, 'FIVE_B'); const c = await createOrGetJob(u2, 'FIVE_A');
    expect(new Set([a.jobId, b.jobId, c.jobId]).size).toBe(3);
    const seeds = await many<{ seed: string }>('SELECT seed FROM ticket_generation_jobs');
    expect(new Set(seeds.map((s) => s.seed)).size).toBe(3);
  });
});

describe('daily ticket end-to-end (DEMO data, fake AI transport)', () => {
  it('generates, persists, locks, and replays with zero AI calls', async () => {
    const ai: FakeAi = { calls: [], pick: (id) => (['demo:0', 'demo:1', 'demo:2', 'demo:3', 'demo:4'].includes(id) ? '1X2:HOME' : null) };
    installFakes(demoFixtures(9), ai);
    const u = await makeUser();
    const before = aiCallCount();
    const { jobId } = await createOrGetJob(u, 'FIVE_A');
    expect(aiCallCount()).toBe(before); // creating the job does not call AI by itself
    const status = await drain(jobId);
    expect(['COMPLETED', 'INCOMPLETE']).toContain(status);
    expect(status).toBe('COMPLETED');
    const ticket = await one<{ id: string; actual_odds: string; leg_count: number }>('SELECT id, actual_odds, leg_count FROM tickets WHERE job_id=$1', [jobId]);
    const sels = await many<{ odds: string }>('SELECT odds FROM ticket_selections WHERE ticket_id=$1', [ticket!.id]);
    const product = sels.reduce((p, s) => p * Number(s.odds), 1);
    expect(Number(ticket!.actual_odds)).toBeCloseTo(product, 2);
    expect(Math.abs(Math.log(product / 5))).toBeLessThanOrEqual(Math.log(1.15) + 1e-6);
    // Independent initial predictions exist for all six agents.
    const agents = await many<{ agent_id: string }>('SELECT DISTINCT agent_id FROM agent_predictions WHERE job_id=$1 AND round=0', [jobId]);
    expect(agents.map((a) => a.agent_id).sort()).toEqual(['alex', 'andrei', 'diana', 'mihai', 'robert', 'victor']);
    // Locked for the day: a second click returns the same job, no new AI.
    const callsAfter = aiCallCount();
    const again = await createOrGetJob(u, 'FIVE_A');
    expect(again).toEqual({ jobId, created: false });
    const states = await slotStates(u);
    expect(states.find((s) => s.slot.id === 'FIVE_A')!.action).toBe('VIEW_TICKET');
    // Viewing + replay: zero AI calls, no jobs created, events ordered.
    const jobsBefore = await one<{ n: string }>('SELECT count(*) n FROM ticket_generation_jobs');
    await listTickets(u); await ticketDetail(u, ticket!.id); const events = (await jobEvents(u, jobId, 0))!;
    expect(aiCallCount()).toBe(callsAfter);
    expect((await one<{ n: string }>('SELECT count(*) n FROM ticket_generation_jobs'))!.n).toBe(jobsBefore!.n);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    for (const t of ['JOB_CREATED', 'SEED_GENERATED', 'POOL_BUILT', 'CANDIDATE_SELECTED', 'SCOUT_STARTED', 'SCOUT_COMPLETED', 'STATS_COMPLETED', 'AGENT_STARTED', 'PREDICTION_SAVED', 'VOTE_SUBMITTED', 'CONSENSUS_CALCULATED', 'ODDS_VALIDATED', 'SELECTION_ACCEPTED', 'OPTIMIZATION_COMPLETED', 'TICKET_FINALIZED']) expect(events.some((e) => e.type === t), t).toBe(true);
    // Cross-user isolation.
    const other = await makeUser('x@t');
    expect(await ticketDetail(other, ticket!.id)).toBeNull();
    expect(await jobEvents(other, jobId, 0)).toBeNull();
  });

  it('NO BET is a terminal, saved outcome that consumes the slot', async () => {
    installFakes(demoFixtures(6), { calls: [], pick: () => null });
    const u = await makeUser();
    const { jobId } = await createOrGetJob(u, 'TEN_B');
    expect(await drain(jobId)).toBe('NO_BET');
    expect((await slotStates(u)).find((s) => s.slot.id === 'TEN_B')!.action).toBe('VIEW_RESULT');
  });

  it('Ticket B uses a different seed than Ticket A', async () => {
    installFakes(demoFixtures(6), { calls: [], pick: () => null });
    const u = await makeUser();
    const a = await createOrGetJob(u, 'TEN_A'); const b = await createOrGetJob(u, 'TEN_B');
    const rows = await many<{ seed: string }>('SELECT seed FROM ticket_generation_jobs WHERE id = ANY($1)', [[a.jobId, b.jobId]]);
    expect(rows[0].seed).not.toBe(rows[1].seed);
  });
});

describe('provider quota failure and recovery', () => {
  it('pauses without fabricating, then resumes the SAME job with the same seed and order', async () => {
    const ai: FakeAi = { calls: [], pick: (id) => (['demo:0', 'demo:1', 'demo:2', 'demo:3'].includes(id) ? '1X2:HOME' : null), failNext: 0 };
    installFakes(demoFixtures(8), ai);
    const u = await makeUser();
    const { jobId } = await createOrGetJob(u, 'FIVE_B');
    ai.failNext = 50; // provider says: daily quota exhausted
    expect(await drain(jobId)).toBe('PAUSED');
    const before = await one<{ seed: string; candidate_order: unknown }>('SELECT seed, candidate_order FROM ticket_generation_jobs WHERE id=$1', [jobId]);
    expect(before!.candidate_order).not.toBeNull();
    const paused = await one<{ last_error: string }>('SELECT last_error FROM ticket_generation_jobs WHERE id=$1', [jobId]);
    expect(paused!.last_error).toMatch(/Cota zilnică/);
    const fabricated = await one<{ n: string }>("SELECT count(*) n FROM agent_predictions WHERE job_id=$1", [jobId]);
    expect(Number(fabricated!.n)).toBe(0);
    ai.failNext = 0;
    await resumeJob(u, jobId);
    const status = await drain(jobId);
    expect(['COMPLETED', 'INCOMPLETE', 'NO_BET']).toContain(status);
    const after = await one<{ seed: string; candidate_order: unknown }>('SELECT seed, candidate_order FROM ticket_generation_jobs WHERE id=$1', [jobId]);
    expect(after!.seed).toBe(before!.seed);
    expect(after!.candidate_order).toEqual(before!.candidate_order);
    const jobs = await one<{ n: string }>('SELECT count(*) n FROM ticket_generation_jobs WHERE user_id=$1', [u]);
    expect(Number(jobs!.n)).toBe(1);
  });

  it('a job interrupted mid-run (expired lease) is recovered from its checkpoint', async () => {
    const ai: FakeAi = { calls: [], pick: () => null };
    installFakes(demoFixtures(4), ai);
    const u = await makeUser();
    const { jobId } = await createOrGetJob(u, 'TEN_A');
    await _processOneForTests();
    // Simulate a Render restart: job left RUNNING with an expired lease.
    await one("UPDATE ticket_generation_jobs SET status='RUNNING', lease_owner='dead-instance', lease_expires_at=now() - interval '1 minute' WHERE id=$1 AND status NOT IN ('COMPLETED','NO_BET','INCOMPLETE')", [jobId]);
    const status = await drain(jobId);
    expect(status).toBe('NO_BET');
  });
});

describe('weekly ticket', () => {
  it('builds exactly 12 distinct fixtures when enough qualify', async () => {
    const ai: FakeAi = { calls: [], pick: () => '1X2:HOME' };
    installFakes(demoFixtures(16, (i) => ({ home: [1.4, 1.45, 1.5, 1.55][i % 4], draw: 4.2, away: 7, dc: 1.1 })), ai);
    const u = await makeUser();
    const { jobId } = await createOrGetJob(u, 'WEEKLY_100');
    const status = await drain(jobId, 1000);
    const t = await one<{ leg_count: number; actual_odds: string; generation_status: string }>('SELECT leg_count, actual_odds, generation_status FROM tickets WHERE job_id=$1', [jobId]);
    expect(status).toBe('COMPLETED');
    expect(t!.leg_count).toBe(12);
    const distinct = await one<{ n: string }>('SELECT count(DISTINCT fixture_id) n FROM ticket_selections s JOIN tickets t ON t.id=s.ticket_id WHERE t.job_id=$1', [jobId]);
    expect(Number(distinct!.n)).toBe(12);
  });
  it('returns an honest INCOMPLETE result when fewer than 12 fixtures qualify', async () => {
    const ai: FakeAi = { calls: [], pick: (id) => (Number(id.split(':')[1]) < 7 ? '1X2:HOME' : null) };
    installFakes(demoFixtures(10), ai);
    const u = await makeUser();
    const { jobId } = await createOrGetJob(u, 'WEEKLY_100');
    expect(await drain(jobId, 1000)).toBe('INCOMPLETE');
    const sel = await one<{ n: string }>('SELECT count(*) n FROM ticket_selections s JOIN tickets t ON t.id=s.ticket_id WHERE t.job_id=$1', [jobId]);
    expect(Number(sel!.n)).toBe(0);
  });
});
