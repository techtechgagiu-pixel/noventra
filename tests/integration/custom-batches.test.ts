import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { many, one } from '@/lib/db';
import { createCustomJob, customBatchJobs } from '@/lib/jobs/service';
import { jobMeta } from '@/lib/views';
import { aiCallCount } from '@/lib/ai/router';
import { clearFakes, closePool, demoFixtures, installFakes, makeUser, resetDb } from './helpers';
const input = { target: 2, legs: 2, agents: ['andrei', 'alex'], fromHours: 2, toHours: 48, leagues: ['ESP1'] };
beforeEach(async () => { await resetDb(); clearFakes(); installFakes(demoFixtures(4), { calls: [], pick: () => null }); });
afterAll(async () => { clearFakes(); await closePool(); });
describe('atomic custom batches', () => {
  it('queues the requested count with independent seeds, identical settings, events and navigable batch metadata', async () => {
    const user = await makeUser(); const before = aiCallCount();
    const r = await createCustomJob(user, { ...input, count: 3, requestId: randomUUID() });
    expect(r.created).toBe(true); expect(r.jobIds).toHaveLength(3); expect(r.jobId).toBe(r.jobIds[0]);
    const jobs = await many<{ seed: string; slot: string; status: string; config: { custom: object; customBatch: { id: string; index: number; count: number } } }>('SELECT seed, slot, status, config FROM ticket_generation_jobs ORDER BY slot');
    expect(new Set(jobs.map((j) => j.seed)).size).toBe(3);
    expect(jobs.map((j) => j.slot)).toEqual(['CUSTOM_1', 'CUSTOM_2', 'CUSTOM_3']);
    for (const [i, j] of jobs.entries()) {
      expect(j.status).toBe('QUEUED'); expect(j.config.custom).toMatchObject(input);
      expect(j.config.customBatch).toEqual({ id: r.batchId, count: 3, index: i + 1 });
    }
    expect((await one<{ n: number }>('SELECT count(*)::int n FROM analysis_events'))?.n).toBe(9);
    expect((await customBatchJobs(user, r.batchId)).map((j) => j.id)).toEqual(r.jobIds);
    expect((await jobMeta(user, r.jobId))?.customBatch).toEqual({ id: r.batchId, count: 3, index: 1 });
    const other = await makeUser('other@t');
    expect(await customBatchJobs(other, r.batchId)).toEqual([]);
    expect((await jobMeta(other, r.jobId))?.customBatch).toBeUndefined();
    expect(aiCallCount()).toBe(before);
  });
  it('deduplicates concurrent retries, including after midnight, and rejects changed settings for the same key', async () => {
    const user = await makeUser(); const body = { ...input, count: 3, requestId: randomUUID() };
    const results = await Promise.all(Array.from({ length: 5 }, () => createCustomJob(user, body, new Date('2026-10-25T12:00:00Z'))));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.jobId)).size).toBe(1);
    expect((await createCustomJob(user, body, new Date('2026-10-26T12:00:00Z'))).jobIds).toEqual(results[0].jobIds);
    await expect(createCustomJob(user, { ...body, count: 2 })).rejects.toThrow(/alte setări/);
    expect((await one<{ n: number }>('SELECT count(*)::int n FROM ticket_generation_jobs'))?.n).toBe(3);
  });
  it('rejects the whole batch when the remaining daily allowance is smaller; concurrent batches cannot exceed 20', async () => {
    const user = await makeUser();
    await createCustomJob(user, { ...input, count: 17 });
    await expect(createCustomJob(user, { ...input, count: 4 })).rejects.toThrow(/Mai poți crea 3/);
    const results = await Promise.allSettled([createCustomJob(user, { ...input, count: 2 }), createCustomJob(user, { ...input, count: 2 })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await one<{ n: number }>('SELECT count(*)::int n FROM ticket_generation_jobs'))?.n).toBe(19);
    await createCustomJob(user, input); // existing single-ticket caller remains supported
    await expect(createCustomJob(user, input)).rejects.toThrow(/Mai poți crea 0/);
  });
  it('accepts a full lot of 20 and resets the allowance on the next Bucharest day', async () => {
    const user = await makeUser();
    const first = await createCustomJob(user, { ...input, count: 20 }, new Date('2026-10-24T12:00:00Z'));
    expect(first.jobIds).toHaveLength(20);
    await expect(createCustomJob(user, input, new Date('2026-10-24T12:30:00Z'))).rejects.toThrow(/Mai poți crea 0/);
    const next = await createCustomJob(user, { ...input, count: 20 }, new Date('2026-10-25T12:00:00Z'));
    expect(next.jobIds).toHaveLength(20);
    expect((await one<{ n: number }>('SELECT count(*)::int n FROM ticket_generation_jobs'))?.n).toBe(40);
  });
  it.each([0, -1, 21, 1.5, '3', null])('rejects invalid quantity %s without creating any jobs', async (count) => {
    const user = await makeUser();
    await expect(createCustomJob(user, { ...input, count })).rejects.toThrow(/bilete/);
    expect((await one<{ n: number }>('SELECT count(*)::int n FROM ticket_generation_jobs'))?.n).toBe(0);
  });
});
