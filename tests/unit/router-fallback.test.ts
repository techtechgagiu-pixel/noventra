import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { setAiTransportForTests, structuredCall } from '@/lib/ai/router';

vi.mock('@/lib/db', () => ({ many: vi.fn(async () => []), query: vi.fn(async () => ({})) }));
vi.mock('@/lib/usage', () => ({ aiUsageToday: vi.fn(async () => ({ requests: 0, tokens: 0 })), recordProviderUsage: vi.fn(async () => {}) }));
afterEach(() => setAiTransportForTests(null));
it.each(['', 'not json'])('uses the fallback after an empty or malformed response and one repair (%j)', async (invalid) => {
  const calls: string[] = [];
  setAiTransportForTests(async (ref) => {
    calls.push(ref.model);
    return { text: ref.model === 'broken' ? invalid : '{"summary":"DEMO verified facts"}', inputTokens: 1, outputTokens: 1, resolvedModel: ref.model };
  });
  const r = await structuredCall({ primary: { provider: 'groq', model: 'broken' }, fallback: { provider: 'gemini', model: 'working' }, schema: z.object({ summary: z.string() }), input: { system: 'Return JSON', user: 'Summarise DEMO facts' }, log: { stage: 'TEST' } });
  expect(calls).toEqual(['broken', 'broken', 'working']);
  expect(r).toMatchObject({ usedFallback: true, model: 'working', data: { summary: 'DEMO verified facts' } });
});
