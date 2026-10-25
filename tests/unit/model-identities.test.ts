import { expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { AGENTS, systemPrompt, BRAIN_SYSTEM } from '@/lib/ai/agents';
import { AGENT_META } from '@/lib/format';
import { NEW_AI_PROFILES } from '@/lib/ai/new-agent-profiles';

const legacy = /Mircea|Lucescu|Hagi|Popescu|Mutu|Ștucan|Hanțu|Caragea|Becali|Dumitrescu|Șumudică|Petrescu|Stoica|Prunea|Porumboiu|Drăgușin|Tamaș|personaj/i;
it('presents all 34 model roles without legacy names, portraits or person-based prompts', () => {
  expect(AGENTS).toHaveLength(34);
  for (const a of AGENTS) {
    const meta = AGENT_META[a.id];
    expect(`${a.name} ${a.title} ${meta.name} ${meta.title} ${systemPrompt(a)}`).not.toMatch(legacy);
    expect(meta.name).toBe(a.name);
    expect(meta.img).toMatch(/^\/ai-portraits\//);
    expect(existsSync(`public${meta.img}`)).toBe(true);
  }
  expect(BRAIN_SYSTEM).not.toMatch(legacy);
  for (const a of NEW_AI_PROFILES) expect(AGENTS.find((x) => x.id === a.id)?.name).toBe(a.modelName);
});
