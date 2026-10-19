import { json } from '@/lib/http';
import { one } from '@/lib/db';
import { config } from '@/lib/config';
import { authConfigured } from '@/lib/auth';

export const dynamic = 'force-dynamic';
/** Reports configuration presence only; never claims an inference was verified. No AI calls. */
export async function GET() {
  let database = 'ok';
  try { await one('SELECT 1'); } catch { database = 'unavailable'; }
  return json({
    status: database === 'ok' ? 'ok' : 'degraded', database, time: new Date().toISOString(), version: '5.0.0',
    auth: authConfigured() ? 'configured' : 'missing',
    ai: { groq: !!config.groqApiKey, gemini: !!config.geminiApiKey, openrouter: !!config.openRouterApiKey },
    sports: { espn: 'public', lpf: 'public', oddsApi: !!config.oddsApiKey },
  }, database === 'ok' ? 200 : 503);
}
