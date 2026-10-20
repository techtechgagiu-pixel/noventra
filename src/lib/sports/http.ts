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
    // Public sources throttle bursts (ESPN answers 403/429 when hit too fast): back off and retry twice.
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, attempt * 2000 + Math.random() * 1000));
      response = await fetch(url, {
        headers: { Accept: opts.as === 'text' ? 'text/html' : 'application/json' },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
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
