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
  blockers: [
    { id: 'production-snapshot', detail: 'Neon source unavailable under its monthly quota; recover and export complete production data, never substitute local DEMO.' },
    { id: 'production-data-parity', detail: 'Verify real schema, every row, history/statistics/auth identity parity and D1 size/row limits on a fresh isolated target.' },
    { id: 'remote-runtime-validation', detail: 'Validate remote staging OAuth, source credentials, runner wake/recovery and provider quotas within existing limits. No remote Worker is deployed yet.' },
    { id: 'free-resource-measurement', detail: 'Measure actual Workers CPU, subrequests and D1 reads/writes at realistic volume; local HTTP durations do not prove Free CPU compatibility.' },
    { id: 'controlled-cutover', detail: 'Freeze old writers, export final snapshot, configure secrets/runner and activate scheduling, then change routes; reconcile new D1 writes before rollback.' },
  ],
  sourceIndicators: hits,
  // These are inventory hints, not a SQL parser or an estimate of engineering hours.
  indicatorCounts: Object.fromEntries(rules.map(([name]) => [name, hits.filter(h => h.rule === name).length])),
}, null, 2));
if (process.argv.includes('--require-ready')) process.exitCode = 1;
