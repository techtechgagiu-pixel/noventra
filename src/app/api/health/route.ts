import { json } from '@/lib/http';
import { one } from '@/lib/db';
import { config } from '@/lib/config';
import { authConfigured } from '@/lib/auth';
import { databaseIssue } from '@/lib/database-availability';

export const dynamic = 'force-dynamic';
/** Reports configuration presence only; never claims an inference was verified. No AI calls. */
export async function GET() {
  if(process.env.BETMIND_DATABASE==='d1-http'&&process.env.BETMIND_MAINTENANCE!=='1'){
    const {refreshStoredCatalog}=await import('@/lib/d1/catalog');
    void refreshStoredCatalog().catch(()=>console.warn(JSON.stringify({event:'catalog_refresh_failed'})));
    // Counter-Strike schedule, results and prices (keys live on the runner only); refreshed when due.
    const {maybeSyncCs}=await import('@/lib/cs/sync');
    void maybeSyncCs().catch(()=>console.warn(JSON.stringify({event:'cs_sync_failed'})));
  }
  let database = 'ok';
  let issue: 'quota' | 'unavailable' | undefined;
  try { await one('SELECT 1'); } catch (error) { database = 'unavailable'; issue = databaseIssue(error); }
  return json({
    status: database === 'ok' ? 'ok' : 'degraded', database, databaseBackend:process.env.BETMIND_DATABASE||'postgres',maintenance:process.env.BETMIND_MAINTENANCE==='1',runnerOnly:process.env.BETMIND_RUNNER_ONLY==='1', ...(issue ? { databaseIssue: issue } : {}), time: new Date().toISOString(), version: '5.0.0',
    auth: authConfigured() ? 'configured' : 'missing',
    ai: { groq: !!config.groqApiKey, gemini: !!config.geminiApiKey, openrouter: !!config.openRouterApiKey },
    sports: { espn: 'public', lpf: 'public', oddsApi: !!config.oddsApiKey },
  }, database === 'ok' ? 200 : 503);
}
