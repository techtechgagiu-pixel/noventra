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
  format: 1, phase: 'preparation', productionReady: false,
  currentDatabase: 'PostgreSQL', targetDatabase: 'Cloudflare D1 (SQLite)',
  blockers: [
    { id: 'production-snapshot', detail: 'Export the complete source after Neon connections are restored; local DEMO is not production data.' },
    { id: 'd1-runtime', detail: 'Port the SQL repositories/transactions and implement atomic job claims and budget reservations in D1.' },
    { id: 'background-runtime', detail: 'Replace persistent Node intervals with bounded Workflows/Cron handlers; keep explicit user authorization for AI jobs.' },
    { id: 'staging-verification', detail: 'Verify login, data parity, new/completed/resumed jobs, settlement and Free-plan CPU/operation limits.' },
  ],
  sourceIndicators: hits,
  // These are inventory hints, not a SQL parser or an estimate of engineering hours.
  indicatorCounts: Object.fromEntries(rules.map(([name]) => [name, hits.filter(h => h.rule === name).length])),
}, null, 2));
if (process.argv.includes('--require-ready')) process.exitCode = 1;
