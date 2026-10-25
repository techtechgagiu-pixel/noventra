import { expect, it } from 'vitest';
import { NEW_AI_PROFILES } from '@/lib/ai/new-agent-profiles';
import { AGENTS, VOTING_AGENTS, systemPrompt } from '@/lib/ai/agents';
import { openRouterDefault, OPENROUTER_PRICE } from '@/lib/ai/openrouter-models';
import { AGENT_META } from '@/lib/format';
import { aiCardIdentity } from '@/lib/ai-card-identity';
import { VOTER_IDS, LEGACY_VOTER_IDS } from '@/lib/agent-roster';
import { FORMATION } from '@/components/custom/map-scene';
import { initialState, applyEvent } from '@/lib/nexus-state';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { factsForAgent } from '@/lib/jobs/analysis';
import type { FixtureSnapshot } from '@/lib/jobs/types';

it('registers ten distinct new voters, model prices and portraits across every presentation surface', () => {
  expect(NEW_AI_PROFILES).toHaveLength(10);expect(VOTING_AGENTS).toHaveLength(32);expect(AGENTS).toHaveLength(34);
  expect(new Set(VOTER_IDS).size).toBe(32);expect(LEGACY_VOTER_IDS).toHaveLength(22);
  expect(new Set(NEW_AI_PROFILES.map((a)=>a.model)).size).toBe(10);
  for(const a of NEW_AI_PROFILES){
    const agent=AGENTS.find((x)=>x.id===a.id)!;
    expect(openRouterDefault(a.id,agent.defaultModel)?.primary).toEqual({provider:'openrouter',model:a.model});
    expect(OPENROUTER_PRICE.get(a.model)).toMatchObject({inPerM:a.inPerM,outPerM:a.outPerM});
    expect(AGENT_META[a.id].img).toBe(`/ai-portraits/${a.id}-v1.webp`);
    expect(existsSync(path.join(process.cwd(),'public',AGENT_META[a.id].img))).toBe(true);
    expect(FORMATION.filter((x)=>x.id===a.id)).toHaveLength(1);
    expect(aiCardIdentity({id:a.id,name:a.name,title:a.title,ownModel:a.model,model:null})).toMatchObject({modelName:a.modelName,portrait:AGENT_META[a.id].img});
    expect(systemPrompt(agent)).toContain('EXCLUSIV datele');
    expect(agent.maxOdds).toBeGreaterThan(1);expect(agent.minProbability).toBeGreaterThan(0);
  }
});

it('tracks new agents in the live/replay reducer using their actual identities', () => {
  const next=applyEvent(initialState(),{seq:1,type:'AGENT_STARTED',stage:'ANALYSIS',agentId:'nova',fixtureId:null,payload:{round:0,model:NEW_AI_PROFILES[0].model,provider:'openrouter',fixtures:['demo:0']},createdAt:new Date().toISOString()});
  expect(next.participants).toContain('nova');expect(next.agents.nova.status).toBe('ANALYZING');expect(next.log.at(-1)?.text).toContain('Nova');
});

it('gives Atlas dated sourced news together with statistics, without changing the news-only role',()=>{
  const team={team:'DEMO',sample:8,record:{w:5,d:2,l:1},recent:[],anomalies:[]};
  const s={fixture:{id:'demo:0',home:'DEMO H',away:'DEMO A'},dossier:{home:team,away:team,missing:[]},standings:{},model:{markets:[]},odds:{},news:{home:[{title:'DEMO report',source:'DEMO Source',publishedAt:'2026-10-25T10:00:00Z'}],away:[],errors:[]}} as unknown as FixtureSnapshot;
  const atlas=factsForAgent('atlas',s,{minOdds:1,maxOdds:3});expect(atlas).toHaveProperty('scout');expect(atlas).toHaveProperty('model');expect(JSON.stringify(atlas)).toContain('[H1] 2026-10-25 · DEMO Source: DEMO report');
  expect(factsForAgent('hantu',s,{minOdds:1,maxOdds:3})).not.toHaveProperty('scout');expect(factsForAgent('nova',s,{minOdds:1,maxOdds:3})).not.toHaveProperty('news');
});
