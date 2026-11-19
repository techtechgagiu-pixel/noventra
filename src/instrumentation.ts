export async function register() {
  if(process.env.BETMIND_MAINTENANCE==='1')return;
  // A request-scoped Worker cannot own the Node service's interval loops.
  // Cloudflare preparation must never resume production jobs accidentally.
  if (process.env.BETMIND_RUNTIME?.startsWith('cloudflare')) return;
  if (process.env.NEXT_RUNTIME !== 'nodejs' || (!process.env.DATABASE_URL && process.env.BETMIND_DATABASE!=='d1-http')) return;
  const { ensureAgentConfig } = await import('./lib/ai/assignments');
  const { startWorker } = await import('./lib/jobs/worker');
  const { startSettlement } = await import('./lib/settlement');
  if (process.env.BETMIND_TEST_MODE === '1' && process.env.BETMIND_E2E_FAKES === '1' && /^http:\/\/(localhost|127\.0\.0\.1)/.test(process.env.APP_BASE_URL || '')) {
    const { installFakes, demoFixtures } = await import('./lib/testing/fakes');
    installFakes(demoFixtures(9, (i) => ({ home: 1.4 + (i % 3) * 0.1, draw: 4.2, away: 6.5, dc: 1.1 })), { calls: [], pick: (id) => (['demo:0', 'demo:1', 'demo:2', 'demo:3', 'demo:4'].includes(id) ? (Number(id.split(':')[1]) % 2 ? 'TOTAL:OVER:1.5' : '1X2:HOME') : null) });
    console.log(JSON.stringify({ event: 'e2e_fakes_installed', note: 'DEMO data only' }));
  }
  await ensureAgentConfig().catch((e) => console.error(JSON.stringify({ event: 'agent_config_failed', message: (e as Error).message })));
  // Non-AI background work only: resuming already-authorised jobs and deterministic settlement.
  startWorker();
  startSettlement();
  if(process.env.BETMIND_DATABASE==='d1-http'){
    const {refreshStoredCatalog}=await import('./lib/d1/catalog');
    void refreshStoredCatalog().catch(()=>console.warn(JSON.stringify({event:'catalog_refresh_failed'})));
  }
}

/** 18.11: keep the real cause of a failed server render (the browser only gets a digest). Best effort, never throws. */
export async function onRequestError(error: unknown, request: { path?: string }, context: { routePath?: string; routeType?: string; renderSource?: string }) {
  try {
    const e = error as Error & { digest?: string };
    console.error(JSON.stringify({ event: 'request_error', digest: e?.digest, path: String(request?.path ?? '').split('?')[0], message: e?.message?.slice(0, 300) }));
    if (!process.env.BETMIND_RUNTIME?.startsWith('cloudflare')) return;
    const { query } = await import('./lib/db');
    await query('INSERT INTO app_errors (digest, path, route, kind, message, stack) VALUES ($1,$2,$3,$4,$5,$6)', [
      String(e?.digest ?? ''), String(request?.path ?? '').split('?')[0].slice(0, 300), String(context?.routePath ?? ''), `${context?.routeType ?? ''}/${context?.renderSource ?? ''}`,
      `${e?.name ?? 'Error'}: ${e?.message ?? String(error)}`.slice(0, 1000), String(e?.stack ?? '').slice(0, 1500),
    ]);
    if (Math.random() < 0.05) await query("DELETE FROM app_errors WHERE at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')");
  } catch { /* logging must never break a request */ }
}
