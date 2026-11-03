import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { one } from '@/lib/db';
import { TOOLS, runTool } from '@/lib/assistant/tools';
import { askAssistant } from '@/lib/assistant/run';
import { closePool, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(closePool);

describe('site assistant', () => {
  it('every tool answers from the database without errors (empty data)', async () => {
    const u = (await one<{ id: string }>("INSERT INTO users(google_sub,email) VALUES('a','a@t') RETURNING id"))!;
    for (const t of TOOLS) {
      const args = t.name === 'istoric_agent' ? { agent_id: 'victor' } : t.name === 'bilet' || t.name === 'piete_meci' ? { id: '00000000-0000-0000-0000-000000000000' } : {};
      const out = await runTool(t.name, JSON.stringify(args), { userId: u.id, owner: false }) as Record<string, unknown>;
      expect(out, t.name).toBeTruthy();
      if (t.name !== 'bilet') expect(out.eroare, `${t.name}: ${String(out.eroare)}`).toBeUndefined();
    }
    expect(await runTool('nu_exista', '{}', { userId: u.id, owner: false })).toMatchObject({ eroare: expect.any(String) });
  });

  it('calls a tool, then answers; records the paid spend under its own cap', async () => {
    const u = (await one<{ id: string }>("INSERT INTO users(google_sub,email) VALUES('b','b@t') RETURNING id"))!;
    process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'test';
    const { config } = await import('@/lib/config');
    (config as { openRouterApiKey: string }).openRouterApiKey = 'test-key';
    let call = 0;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      call++;
      const body = JSON.parse(String((init as RequestInit).body));
      expect(body.model).toBe('anthropic/claude-haiku-5.5');
      if (call === 1) return Response.json({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'rezumat_platforma', arguments: '{}' } }] } }], usage: { prompt_tokens: 3000, completion_tokens: 50 } });
      expect(body.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 't1' });
      return Response.json({ choices: [{ message: { role: 'assistant', content: 'Nu există încă bilete decontate.' } }], usage: { prompt_tokens: 3500, completion_tokens: 40 } });
    });
    try {
      const r = await askAssistant([{ role: 'user', content: 'Câte bilete am câștigat?' }], { userId: u.id, owner: false });
      expect(r).toMatchObject({ answer: 'Nu există încă bilete decontate.', tools: ['rezumat_platforma'], model: 'anthropic/claude-haiku-5.5' });
      const usage = await one<{ microusd: string; questions: number }>('SELECT microusd, questions FROM assistant_usage');
      expect(Number(usage!.microusd)).toBe(Math.ceil(3000 * 0.1 + 50 * 0.5) + Math.ceil(3500 * 0.1 + 40 * 0.5));
      expect(usage!.questions).toBe(1);
    } finally { spy.mockRestore(); }
  });
});
