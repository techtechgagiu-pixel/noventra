import { aiCallCount } from '@/lib/ai/router';
import { config } from '@/lib/config';
import { json } from '@/lib/http';
import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';
/** Test-mode only: exposes counters so e2e tests can assert zero AI calls during replay. */
export async function GET() {
  if (!config.allowDemoProviders || !/^http:\/\/(localhost|127\.0\.0\.1)/.test(config.appBaseUrl)) return new Response('Not found', { status: 404 });
  const jobs = await one<{ n: string }>('SELECT count(*) n FROM ticket_generation_jobs');
  return json({ aiCalls: aiCallCount(), jobs: Number(jobs?.n ?? 0) });
}
