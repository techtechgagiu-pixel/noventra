import { json } from '@/lib/http';
import { one } from '@/lib/db';
import { config } from '@/lib/config';
import { authConfigured } from '@/lib/auth';
import { databaseIssue } from '@/lib/database-availability';
import { safeEqual } from '@/lib/safe-equal';

export const dynamic = 'force-dynamic';
/** Public: status, database (plus the coarse databaseIssue code the error page reads) and time.
 * The configuration details only with the header x-p11-health equal to D1_BRIDGE_SECRET (19.11). No AI calls. */
export async function GET(req?: Request) {
  if(process.env.BETMIND_DATABASE==='d1-http'&&process.env.BETMIND_MAINTENANCE!=='1'){
    const {refreshStoredCatalog}=await import('@/lib/d1/catalog');
    void refreshStoredCatalog().catch(()=>console.warn(JSON.stringify({event:'catalog_refresh_failed'})));
  }
  let database = 'ok';
  let issue: 'quota' | 'unavailable' | undefined;
  try { await one('SELECT 1'); } catch (error) { database = 'unavailable'; issue = databaseIssue(error); }
  const secret = process.env.D1_BRIDGE_SECRET;
  const detailed = !!secret && await safeEqual(req?.headers.get('x-p11-health'), secret);
  return json({
    status: database === 'ok' ? 'ok' : 'degraded', database, ...(issue ? { databaseIssue: issue } : {}), time: new Date().toISOString(),
    ...(detailed ? {
      databaseBackend: process.env.BETMIND_DATABASE || 'postgres', maintenance: process.env.BETMIND_MAINTENANCE === '1', runnerOnly: process.env.BETMIND_RUNNER_ONLY === '1', version: '5.0.0',
      auth: authConfigured() ? 'configured' : 'missing',
      ai: { groq: !!config.groqApiKey, gemini: !!config.geminiApiKey, openrouter: !!config.openRouterApiKey },
      sports: { espn: 'public', lpf: 'public', oddsApi: !!config.oddsApiKey },
    } : {}),
  }, database === 'ok' ? 200 : 503);
}
