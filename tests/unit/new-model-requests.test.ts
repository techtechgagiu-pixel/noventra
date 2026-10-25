import { afterEach, expect, it, vi } from 'vitest';
const saved=vi.hoisted(()=>{const key=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='demo-request-test';return key;});
import { z } from 'zod';
import { structuredCall } from '@/lib/ai/router';
import { NEW_AI_PROFILES } from '@/lib/ai/new-agent-profiles';
import { readFileSync } from 'node:fs';
vi.mock('@/lib/db',()=>({many:vi.fn(async()=>[]),query:vi.fn(async()=>({}))}));
vi.mock('@/lib/usage',()=>({aiUsageToday:vi.fn(async()=>({requests:0,tokens:0})),recordProviderUsage:vi.fn(async()=>{})}));
afterEach(()=>{vi.unstubAllGlobals();if(saved===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=saved;});
const catalogue=JSON.parse(readFileSync('docs/new-ai-models-catalog-2026-10-25.json','utf8')).models;
it.each(NEW_AI_PROFILES)('sends compatible JSON requests for $model with bounded mandatory reasoning',async(a)=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({model:a.model,choices:[{message:{content:'{"ok":true}'}}],usage:{prompt_tokens:10,completion_tokens:20}}),{status:200}));vi.stubGlobal('fetch',fetcher);
  const r=await structuredCall({primary:{provider:'openrouter',model:a.model},fallback:null,schema:z.object({ok:z.boolean()}),input:{system:'DEMO return JSON',user:'DEMO'},log:{stage:'TEST'}});
  expect(r.data.ok).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1);
  const body=JSON.parse((fetcher.mock.calls[0] as unknown as [string,RequestInit])[1].body as string);
  expect(body.response_format).toEqual({type:'json_object'});expect(body.max_completion_tokens).toBeGreaterThanOrEqual(4000);expect(body.max_completion_tokens).toBeLessThanOrEqual(8000);
  const entry=catalogue.find((m:{id:string})=>m.id===a.model);
  if(entry.reasoning?.mandatory){expect(body.reasoning.enabled).not.toBe(false);expect(entry.reasoning.supported_efforts).toContain(body.reasoning.effort);expect(body.reasoning.exclude).toBe(true);}
});
