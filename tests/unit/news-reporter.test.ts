import { expect, it } from 'vitest';
import { newsBulletin } from '@/lib/news-reporter';
import { AGENTS, VOTING_AGENTS, systemPrompt } from '@/lib/ai/agents';
import { cleanAgentText } from '@/lib/agent-names';

it('keeps Ștucan historical identity and adds Corina as a non-voting sports reporter', () => {
  expect(AGENTS.find((a) => a.id === 'hantu')!.name).toBe('Nemotron 3.5 Super VL');
  expect(cleanAgentText('Hanțu citează presa.')).toBe('Nemotron 3.5 Super VL citează presa.');
  const corina = AGENTS.find((a) => a.id === 'corina')!;
  expect(corina.name).toBe('Claude Haiku 5.5');
  expect(VOTING_AGENTS.some((a) => a.id === 'corina')).toBe(false);
  expect(systemPrompt(corina)).not.toContain('BET_CANDIDATE');
});

it('retains sourced headlines, removes duplicates and states missing news honestly', () => {
  const item = { title: 'Lotul pentru meci a fost anunțat', source: 'DEMO Sport', link: 'https://example.com/news' };
  const r = newsBulletin('DEMO A – DEMO B', [item, item, { title: 'Fără sursă', source: null }]);
  expect(r.headlines).toEqual([item]);
  expect(r.commentary).toContain('1 titlu');
  expect(newsBulletin('DEMO A – DEMO B', []).commentary).toContain('Nu am găsit știri');
});

it('binds Corina to the user-selected Haiku model and includes its real price in accounting', async () => {
  const { OPENROUTER_MODELS, OPENROUTER_PRICE } = await import('@/lib/ai/openrouter-models');
  expect(OPENROUTER_MODELS.corina.model).toBe('anthropic/claude-haiku-5.5');
  expect(OPENROUTER_PRICE.get(OPENROUTER_MODELS.corina.model)).toMatchObject({ inPerM: 0.1, outPerM: 0.5 });
});

it('rejects executable source links', () => {
  expect(newsBulletin('DEMO', [{ title: 'Știre', source: 'Sursă', link: 'javascript:alert(1)' }]).headlines).toHaveLength(0);
});
