export async function register() {
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
