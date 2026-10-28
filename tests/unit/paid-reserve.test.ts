import { afterEach, expect, it, vi } from 'vitest';
const saved = vi.hoisted(() => { const k = { o: process.env.OPENROUTER_API_KEY, g: process.env.GROQ_API_KEY, m: process.env.GOOGLE_GENERATIVE_AI_API_KEY };
  process.env.OPENROUTER_API_KEY = 'demo'; process.env.GROQ_API_KEY = 'demo'; process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'demo'; return k; });
import { z } from 'zod';
import { PAID_RESERVE_MODELS, RateLimitError, RESERVE_MODELS, clearModelExhaustionForTests, setAiTransportForTests, structuredCall } from '@/lib/ai/router';

vi.mock('@/lib/db', async (orig) => ({ ...await orig<typeof import('@/lib/db')>(), many: vi.fn(async () => []), one: vi.fn(async () => null), query: vi.fn(async () => ({})) }));
vi.mock('@/lib/usage', () => ({ aiUsageToday: vi.fn(async () => ({ requests: 0, tokens: 0 })), recordProviderUsage: vi.fn(async () => {}) }));
afterEach(() => { setAiTransportForTests(null); clearModelExhaustionForTests(); Object.assign(process.env, { OPENROUTER_API_KEY: saved.o ?? '', GROQ_API_KEY: saved.g ?? '', GOOGLE_GENERATIVE_AI_API_KEY: saved.m ?? '' }); });

it('when the agent model and every free reserve are out for the day, a cheap paid model answers instead of waiting', async () => {
  const calls: string[] = [];
  setAiTransportForTests(async (ref) => {
    calls.push(ref.model);
    if (ref.model !== PAID_RESERVE_MODELS[0].model) throw new RateLimitError(ref.provider, 6 * 3600_000, true);
    return { text: '{"ok":true}', inputTokens: 1, outputTokens: 1, resolvedModel: ref.model };
  });
  const r = await structuredCall({ primary: { provider: 'gemini', model: 'gemini-3.1-flash-lite' }, fallback: null, schema: z.object({ ok: z.boolean() }), input: { system: 'JSON', user: 'DEMO' }, log: { stage: 'TEST' } });
  expect(r.model).toBe('deepseek/deepseek-v4-flash');
  expect(calls).toEqual([...RESERVE_MODELS.map((m) => m.model), 'deepseek/deepseek-v4-flash']);
});
