import assert from 'node:assert/strict';

// This check is intentionally local-only. No AI/account operation is executed.
const base = new URL(process.env.CLOUDFLARE_PREVIEW_URL || 'http://localhost:8787');
assert(['localhost', '127.0.0.1'].includes(base.hostname), 'Preview smoke tests must run locally');
const results = [];
const home = await fetch(base, { headers: { Cookie: 'bm_session=must-not-reach-production-database' } });
assert.equal(home.status, 200);
assert.equal(home.headers.get('x-robots-tag'), 'noindex, nofollow');
assert.match(await home.text(), /Previzualizare pentru migrare/);
results.push({ route: '/', status: 200, sessionStripped: true });
for (const route of ['/auth/google', '/login', '/?tab=custom', '/api/health']) {
  const response = await fetch(new URL(route, base), { redirect: 'manual' });
  assert.equal(response.status, 503);
  results.push({ route, status: response.status });
}
const write = await fetch(new URL('/api/jobs', base), { method: 'POST', body: '{}' });
assert.equal(write.status, 503);
results.push({ route: 'POST /api/jobs', status: write.status });
const readiness = await fetch(new URL('/api/migration-readiness', base));
assert.equal(readiness.status, 503);
assert.deepEqual(await readiness.json(), { status: 'preparation-only', database: 'not-connected', aiExecution: 'disabled', productionReady: false });
results.push({ route: '/api/migration-readiness', status: 503 });
console.log(JSON.stringify({ status: 'passed', checks: results }, null, 2));
