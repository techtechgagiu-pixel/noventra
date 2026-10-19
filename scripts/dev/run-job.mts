// Operator script: runs ONE real job end-to-end locally (real ESPN + real AI). Not part of the app.
import { one, closePool } from '../../src/lib/db';
import { createOrGetJob } from '../../src/lib/jobs/service';
import { _processOneForTests } from '../../src/lib/jobs/worker';
const slot = process.argv[2] || 'FIVE_A';
const u = await one<{ id: string }>(`INSERT INTO users(google_sub,email,name,role) VALUES ('dev:operator','operator@local','Operator','admin') ON CONFLICT (google_sub) DO UPDATE SET email=EXCLUDED.email RETURNING id`);
const { jobId, created } = await createOrGetJob(u!.id, slot);
console.log('job', jobId, 'created', created);
const t0 = Date.now();
for (;;) {
  const j = await one<{ status: string; stage: string; next_run_at: Date; last_error: string | null; last_event_seq: number }>('SELECT status, stage, next_run_at, last_error, last_event_seq FROM ticket_generation_jobs WHERE id=$1', [jobId]);
  console.log(new Date().toISOString().slice(11, 19), j!.status, j!.stage, 'events', j!.last_event_seq, j!.last_error ?? '');
  if (['COMPLETED', 'INCOMPLETE', 'NO_BET', 'FAILED', 'PAUSED'].includes(j!.status)) break;
  const did = await _processOneForTests();
  if (!did) await new Promise((r) => setTimeout(r, Math.max(1000, Math.min(30_000, j!.next_run_at.getTime() - Date.now()))));
  if (Date.now() - t0 > 40 * 60_000) break;
}
console.log('elapsed s', Math.round((Date.now() - t0) / 1000));
await closePool();
