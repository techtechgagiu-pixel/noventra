import { afterAll, beforeEach, expect, it } from 'vitest';
import { one, query } from '@/lib/db';
import { runAutomation, automationHealth } from '@/lib/automation';
import { closePool, resetDb } from './helpers';

beforeEach(async () => { await resetDb(); await query('TRUNCATE automation_runs'); });
afterAll(closePool);

it('records success and source failures separately, without hiding the last successful pass', async () => {
  expect((await runAutomation('test', async () => ({ sourceErrors: 0 }))).status).toBe('completed');
  const before = await one('SELECT last_success_at FROM automation_runs WHERE name=$1', ['test']);
  expect((await runAutomation('test', async () => ({ sourceErrors: 2 }))).status).toBe('partial');
  expect(await one('SELECT last_success_at FROM automation_runs WHERE name=$1', ['test'])).toEqual(before);
  expect((await automationHealth()).runs[0].last_error).toContain('2 cereri');
});

it('allows only one process to own a pass and recovers an expired lease', async () => {
  await query(`INSERT INTO automation_runs(name,lease_owner,lease_until) VALUES ('test','other',now()+interval '1 minute')`);
  let called = false;
  expect((await runAutomation('test', async () => { called = true; return {}; })).status).toBe('busy');
  expect(called).toBe(false);
  await query(`UPDATE automation_runs SET lease_until=now()-interval '1 minute'`);
  expect((await runAutomation('test', async () => ({}))).status).toBe('completed');
});

it('persists a failed pass and frees its lease for the next automatic retry', async () => {
  expect((await runAutomation('test', async () => { throw new Error('DEMO source unavailable'); })).status).toBe('failed');
  expect(await one('SELECT lease_owner,last_error FROM automation_runs WHERE name=$1', ['test'])).toMatchObject({ lease_owner: null, last_error: 'DEMO source unavailable' });
  expect((await runAutomation('test', async () => ({}))).status).toBe('completed');
});
