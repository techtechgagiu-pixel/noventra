import { beforeEach, expect, it, vi } from 'vitest';
import { reportNewsBatch } from '@/lib/news-reporter';
import { structuredCall } from '@/lib/ai/router';
import type { Assignment } from '@/lib/ai/assignments';
vi.mock('@/lib/ai/router', () => ({ structuredCall: vi.fn() }));
const call = vi.mocked(structuredCall);
const assignment: Assignment = { agentId: 'corina', primary: { provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' }, fallback: null, promptVersion: 'TEST' };
const inputs = [{ fixtureId: 'DEMO:1', match: 'DEMO A – DEMO B', kickoff: '2026-10-24T17:00:00Z', headlines: [{ title: 'Antrenamentul echipei', source: 'DEMO Sport', link: 'https://example.com/news', publishedAt: '2026-10-22T08:00:00Z' }] }];
beforeEach(() => { call.mockReset(); });
it('makes a genuine structured AI call, keeps source indices and records the actual fallback model', async () => {
  call.mockImplementation(async (opts) => ({ data: opts.schema.parse({ reports: [{ fixtureId: 'DEMO:1', decision: 'INSUFFICIENT', priority: 'NORMAL', observations: [{ text: 'DEMO Sport relatează despre antrenament.', sources: [1], certainty: 'attributed' }, { text: 'Lotul nu este confirmat.', sources: [1], certainty: 'unconfirmed' }] }] }), provider: 'gemini', model: 'DEMO-reserve', requestedModel: 'DEMO-reserve', inputTokens: 10, outputTokens: 20, latencyMs: 1, usedFallback: true }));
  const result = await reportNewsBatch(inputs, assignment, 'DEMO-job');
  expect(call).toHaveBeenCalledTimes(1);
  expect(call.mock.calls[0][0]).toMatchObject({ primary: assignment.primary, log: { agentId: 'corina', stage: 'NEWS' } });
  expect(result.reports[0]).toMatchObject({ mode: 'ai', model: 'gemini/DEMO-reserve', usedFallback: true, decision: 'INSUFFICIENT', priority: 'NORMAL' });
  expect(result.reports[0].commentary).toContain('Neconfirmat: Lotul nu este confirmat. [1]');
});
it.each([
  { fixtureId: 'invented-match', decision: 'RELEVANT', priority: 'NORMAL', observations: [{ text: 'Titlu', sources: [1], certainty: 'attributed' }] },
  { fixtureId: 'DEMO:1', decision: 'INSUFFICIENT', priority: 'NORMAL', observations: [{ text: 'Titlu', sources: [2], certainty: 'attributed' }] },
])('rejects an invented match or citation and shows sources-only fallback (%j)', async (report) => {
  call.mockImplementation(async (opts) => { opts.schema.parse({ reports: [report] }); throw new Error('unreachable'); });
  const result = await reportNewsBatch(inputs, assignment, 'DEMO-job');
  expect(result.error).toBeTruthy();
  expect(result.reports[0]).toMatchObject({ mode: 'sources_only', model: null });
});
it('skips inference when there are no sourced news items', async () => {
  const result = await reportNewsBatch([{ ...inputs[0], headlines: [] }], assignment, 'DEMO-job');
  expect(call).not.toHaveBeenCalled();
  expect(result.reports[0].commentary).toContain('Nu am găsit știri');
});
it('keeps news failures optional without claiming a successful AI answer', async () => {
  call.mockRejectedValue(new Error('DEMO budget exceeded'));
  const result = await reportNewsBatch(inputs, assignment, 'DEMO-job');
  expect(result.error).toBe('DEMO budget exceeded');
  expect(result.reports[0].mode).toBe('sources_only');
});
