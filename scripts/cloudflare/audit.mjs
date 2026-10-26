import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rules = [
  ['pg-driver', /\bpg\.(?:Pool|PoolClient)|from ['"]pg['"]/],
  ['jsonb-and-casts', /::(?:jsonb|uuid|date|int|numeric|text|boolean)|\bjsonb_\w+|->>?/],
  ['postgres-query', /\bDISTINCT ON\b|\bLATERAL\b|\bILIKE\b|\bANY\(|\barray_agg\(|\bFILTER\s*\(/],
  ['leases-and-locks', /SKIP LOCKED|pg_advisory|\bINTERVAL\s*'/i],
  ['persistent-loop', /setInterval\(/],
];
async function scan(directory) {
  const hits = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) hits.push(...await scan(file));
    else if (/\.(?:ts|tsx)$/.test(file)) {
      const lines = (await readFile(file, 'utf8')).split('\n');
      lines.forEach((text, i) => {
        for (const [rule, pattern] of rules) if (pattern.test(text)) hits.push({ file: path.relative(root, file), line: i + 1, rule });
      });
    }
  }
  return hits;
}
const hits = await scan(path.join(root, 'src'));
console.log(JSON.stringify({
  format: 2, phase: 'hybrid-staging', productionReady: false,
  currentProduction: 'Render + Neon (unchanged)',
  target: { site: 'Cloudflare Workers / OpenNext', database: 'Cloudflare D1', longAiJobs: 'existing Render web service on demand', settlement: 'Cloudflare Workflow every 5 minutes after cutover' },
  implemented: ['native D1 repositories and atomic job mutations', 'HMAC Render-to-D1 bridge with replay protection', 'bounded settlement Workflow and idempotent scheduled dispatch', 'D1 cached fixture offer', 'shared paid-model budget reservations'],
  productionSnapshot: { recovered: true, tables: 26, rows: 82933, nativePostgresArchiveVerified: true, allRowsConvertedAndCompared: true, localD1ImportVerified: true },
  isolatedImport: { database: 'primul11-migration-20261025', rows: 82933, remainingRows: 0, importedRowsCompared: true, complete: true, historicalSnapshotNotFinal: true, runtimeMigrations: '0001–0007' },
  validationDeployment: { worker: 'primul11-validation', privateHeaderGate: true, authenticatedHttpRoutes: 15, agentRecordsCompared: 34, syntheticSession: true, realGoogleOAuthVerified: false, productionRunnerConnected: false, cronsEnabled: false, workflow: { remoteRun: 'migration-check-20261026', completedPages: 30, backlogRemaining: true } },
  accountPlan: 'User upgraded D1/Workers; monthly 50M included writes verified in dashboard on 2026-10-26. No subscription was purchased by the agent.',
  blockers: [
    { id: 'final-production-data-parity', detail: 'The complete historical remote snapshot and all 34 agent result records match. Production has continued receiving writes; take a final frozen source snapshot or reconcile every new row before cutover.' },
    { id: 'remote-runtime-validation', detail: 'Private remote Worker passes 15 HTTP routes, normal-user admin denial and unsigned bridge denial. Verify real Google OAuth, the actual Render runner wake/recovery and provider configuration before cutover; synthetic sessions are not OAuth proof.' },
    { id: 'resource-measurement', detail: 'Measure actual Workers CPU, subrequests and D1 reads/writes at realistic volume on the user-upgraded plan. HTTP wall time is not CPU measurement; keep explicit resource limits.' },
    { id: 'controlled-cutover', detail: 'Freeze old writers, export final snapshot, configure secrets/runner and activate scheduling, then change routes; reconcile new D1 writes before rollback.' },
  ],
  sourceIndicators: hits,
  // These are inventory hints, not a SQL parser or an estimate of engineering hours.
  indicatorCounts: Object.fromEntries(rules.map(([name]) => [name, hits.filter(h => h.rule === name).length])),
}, null, 2));
if (process.argv.includes('--require-ready')) process.exitCode = 1;
