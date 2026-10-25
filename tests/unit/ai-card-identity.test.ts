import { expect, it } from 'vitest';
import { aiCardIdentity } from '@/lib/ai-card-identity';
const agent={id:'robert',name:'Mircea Lucescu',title:'Managerul de risc · Antrenor',ownModel:'openai/gpt-6-luna-pro',model:'google/older-model'};
it('reveals the currently assigned model, while preserving the role, agent and portrait identity',()=>{
  expect(aiCardIdentity(agent)).toMatchObject({modelId:'openai/gpt-6-luna-pro',modelName:'GPT-6 Luna Pro',company:'OpenAI',characterName:'Mircea Lucescu',role:'Managerul de risc',portrait:'/ai-portraits/robert-v1.webp'});
  expect(aiCardIdentity({...agent,ownModel:'new-vendor/future-model-v2'})).toMatchObject({modelName:'future model v2',company:'new-vendor',portrait:'/ai-portraits/robert-v1.webp'});
});
it('keeps two characters on the same model separate rather than merging their records',()=>{
  const a=aiCardIdentity({...agent,id:'victor',name:'Mircea Sandu',ownModel:'anthropic/claude-haiku-5.5'});
  const b=aiCardIdentity({...agent,id:'corina',name:'Corina Caragea',ownModel:'anthropic/claude-haiku-5.5'});
  expect(a.modelName).toBe(b.modelName);expect(a.portrait).not.toBe(b.portrait);expect(a.characterName).not.toBe(b.characterName);
});
it('handles native provider IDs, older history and unknown agents without fabricated model assignments',()=>{
  expect(aiCardIdentity({...agent,id:'scout',ownModel:'gemini-3.1-flash-lite'})).toMatchObject({company:'Google',modelName:'Gemini 3.1 Flash Lite'});
  expect(aiCardIdentity({...agent,ownModel:null,model:'qwen/qwen3.8-flash'}).modelName).toBe('Qwen 3.8 Flash');
  expect(aiCardIdentity({...agent,id:'unknown',ownModel:null,model:null})).toMatchObject({modelId:null,modelName:'Model neatribuit',portrait:null});
});
