import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Cloudflare preparation isolation', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  it('never starts Node loops or assignment writes in the Cloudflare runtime', async () => {
    vi.stubEnv('BETMIND_RUNTIME', 'cloudflare-preview');
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('DATABASE_URL', 'postgresql://must-not-connect.invalid/production');
    const { register } = await import('@/instrumentation');
    await expect(register()).resolves.toBeUndefined();
  });
  it('keeps the prep configuration detached from production routes and providers', () => {
    const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
    expect(config.routes).toBeUndefined();
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
    expect(config.vars.BETMIND_DISABLE_WORKER).toBe('1');
    expect(Object.keys(config.vars)).not.toContain('DATABASE_URL');
    expect(Object.keys(config.vars)).not.toContain('OPENROUTER_API_KEY');
    expect(config.r2_buckets).toBeUndefined();
    expect(config.images).toBeUndefined();
  });
});
