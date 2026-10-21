import { config } from '../config';
import { providerUsageToday, recordProviderUsage } from '../usage';

type CacheEntry = { expires: number; value: unknown };
const globalCache = globalThis as unknown as { __betmindHttpCache?: Map<string, CacheEntry>; __betmindInflight?: Map<string, Promise<unknown>> };
const cache = (globalCache.__betmindHttpCache ??= new Map());
const inflight = (globalCache.__betmindInflight ??= new Map());

export class QuotaExceededError extends Error {
  constructor(public provider: string) {
    super(`Limita zilnică de cereri pentru ${provider} a fost atinsă.`);
  }
}

// Polite global pacing per provider, shared by every job in this process: at most N requests in flight
// and a minimum spacing between request starts (ESPN blocks bursts with 403).
const LIMITS: Record<string, { concurrent: number; spacingMs: number }> = { espn: { concurrent: 3, spacingMs: 150 }, gnews: { concurrent: 2, spacingMs: 400 } };
const gate = globalCache as unknown as { __bmGate?: Map<string, { active: number; last: number; queue: Array<() => void> }> };
const gates = (gate.__bmGate ??= new Map());
async function acquire(provider: string) {
  const lim = LIMITS[provider];
  if (!lim) return () => {};
  const g = gates.get(provider) ?? { active: 0, last: 0, queue: [] };
  gates.set(provider, g);
  if (g.active >= lim.concurrent) await new Promise<void>((r) => g.queue.push(r));
  g.active++;
  const wait = g.last + lim.spacingMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  g.last = Date.now();
  return () => { g.active--; g.queue.shift()?.(); };
}

/** Counted, cached, de-duplicated JSON/text GET for public sports sources. */
export async function sportsGet<T = unknown>(url: string, opts: { provider: string; ttlMs: number; as?: 'json' | 'text'; timeoutMs?: number }): Promise<T> {
  const key = `${opts.as ?? 'json'}:${url}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const work = (async () => {
    const usage = await providerUsageToday(opts.provider).catch(() => ({ requests: 0 }));
    if (usage.requests >= config.limits.sportsDailyRequests) throw new QuotaExceededError(opts.provider);
    // Public sources throttle bursts (ESPN answers 403/429 when hit too fast): back off (3 s, 8 s, 20 s) and retry.
    let response: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, [0, 3000, 8000, 20000][attempt] + Math.random() * 1500));
      const release = await acquire(opts.provider);
      try {
        response = await fetch(url, {
          headers: { Accept: opts.as === 'text' ? 'text/html' : 'application/json' },
          signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
        });
      } finally { release(); }
      void recordProviderUsage(opts.provider, { errors: response.ok ? 0 : 1 });
      if (response.ok || ![403, 429, 500, 502, 503, 504].includes(response.status)) break;
    }
    response = response!;
    if (!response.ok) throw new Error(`${opts.provider} a răspuns ${response.status}`);
    const value = opts.as === 'text' ? await response.text() : await response.json();
    if (cache.size > 2000) cache.clear();
    cache.set(key, { expires: Date.now() + opts.ttlMs, value });
    return value;
  })().finally(() => inflight.delete(key));
  inflight.set(key, work);
  return work as Promise<T>;
}

export function clearSportsCache() {
  cache.clear();
}
