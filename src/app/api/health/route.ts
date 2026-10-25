import { json } from '@/lib/http';
import { one } from '@/lib/db';
import { config } from '@/lib/config';
import { authConfigured } from '@/lib/auth';
import { databaseIssue } from '@/lib/database-availability';

export const dynamic = 'force-dynamic';
/** Reports configuration presence only; never claims an inference was verified. No AI calls. */
export async function GET() {
  if(process.env.BETMIND_DATABASE==='d1-http'){
    const {refreshStoredCatalog}=await import('@/lib/d1/catalog');
    void refreshStoredCatalog().catch(()=>console.warn(JSON.stringify({event:'catalog_refresh_failed'})));
  }
  let database = 'ok';
  let issue: 'quota' | 'unavailable' | undefined;
  try { await one('SELECT 1'); } catch (error) { database = 'unavailable'; issue = databaseIssue(error); }
  return json({
    status: database === 'ok' ? 'ok' : 'degraded', database, ...(issue ? { databaseIssue: issue } : {}), time: new Date().toISOString(), version: '5.0.0',
    auth: authConfigured() ? 'configured' : 'missing',
    ai: { groq: !!config.groqApiKey, gemini: !!config.geminiApiKey, openrouter: !!config.openRouterApiKey },
    sports: { espn: 'public', lpf: 'public', oddsApi: !!config.oddsApiKey },
  }, database === 'ok' ? 200 : 503);
}
