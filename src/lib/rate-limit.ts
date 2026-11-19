import { rateLimited } from './http';

/**
 * 19.11: request limits on the routes that cost money or protect logins, shared by every Cloudflare isolate.
 * Each name is a Workers Rate Limiting binding (`ratelimits` in wrangler.production.jsonc) with its limit set there;
 * `limit`/`windowMs` here must match it and are used by the in-memory fallback (local, Render, tests) and when the
 * binding is missing or fails. The binding counts per Cloudflare location, so limits are approximate by design.
 */
export const RATE_LIMITS = {
  RL_LOGIN_ALL: { limit: 100, windowMs: 60_000 },
  RL_LOGIN: { limit: 10, windowMs: 60_000 },
  RL_ASSISTANT: { limit: 12, windowMs: 60_000 },
  RL_CUSTOM: { limit: 6, windowMs: 60_000 },
  RL_CHECKOUT: { limit: 5, windowMs: 60_000 },
} as const;
export type RateLimitName = keyof typeof RATE_LIMITS;

type Binding = { limit(options: { key: string }): Promise<{ success: boolean }> };

async function binding(name: RateLimitName): Promise<Binding | null> {
  if (!process.env.BETMIND_RUNTIME?.startsWith('cloudflare')) return null;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    const b = (env as unknown as Record<string, unknown>)[name] as Binding | undefined;
    return b && typeof b.limit === 'function' ? b : null;
  } catch { return null; }
}

/** True when this key went over the named limit. Falls back to the per-isolate counter when the binding is unavailable. */
export async function limitExceeded(name: RateLimitName, key: string): Promise<boolean> {
  const { limit, windowMs } = RATE_LIMITS[name];
  const b = await binding(name);
  if (b) {
    try { return !(await b.limit({ key: `${name}:${key}` })).success; }
    catch (error) { console.warn(JSON.stringify({ event: 'rate_limit_binding_failed', name, message: (error as Error).message?.slice(0, 200) })); }
  }
  return rateLimited(`${name}:${key}`, limit, windowMs);
}
