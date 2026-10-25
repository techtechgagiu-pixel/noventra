import type { AgentStat } from './agent-stats';

const MODEL_NAMES: Record<string, string> = {
  'claude-haiku-5.5': 'Claude Haiku 5.5', 'deepseek-v4.1-flash': 'DeepSeek V4.1 Flash',
  'gpt-6-luna': 'GPT-6 Luna', 'gpt-6-luna-pro': 'GPT-6 Luna Pro', 'mimo-v2.6-flash': 'MiMo V2.6 Flash',
  'glm-5.3-flash': 'GLM 5.3 Flash', 'qwen3.8-flash': 'Qwen 3.8 Flash', 'llama-4-maverick': 'Llama 4 Maverick',
  'gemma-4-31b-it': 'Gemma 4 31B', 'hy3': 'HY3', 'nemotron-3.5-super-vl': 'Nemotron 3.5 Super VL',
  'grok-4.3': 'Grok 4.3', 'mistral-medium-3.1': 'Mistral Medium 3.1', 'kimi-k2.5': 'Kimi K2.5',
  'command-r-08-2024': 'Command R', 'qwen3-235b-a22b-2507': 'Qwen 3 235B', 'seed-2.0-mini': 'Seed 2.0 Mini',
  'solar-pro4': 'Solar Pro 4', 'mercury-3': 'Mercury 3', 'nex-n2.5-pro': 'NEX N2.5 Pro',
  'ling-3.1-flash': 'Ling 3.1 Flash', 'deepseek-v4-pro': 'DeepSeek V4 Pro', 'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
};
const PROVIDERS: Record<string, string> = {
  anthropic: 'Anthropic', openai: 'OpenAI', deepseek: 'DeepSeek', xiaomi: 'Xiaomi', 'z-ai': 'Z.ai', qwen: 'Qwen',
  'meta-llama': 'Meta', google: 'Google', tencent: 'Tencent', nvidia: 'NVIDIA', 'x-ai': 'xAI', mistralai: 'Mistral AI',
  moonshotai: 'Moonshot AI', cohere: 'Cohere', 'bytedance-seed': 'ByteDance', upstage: 'Upstage', inception: 'Inception',
  'nex-agi': 'NEX AGI', inclusionai: 'InclusionAI',
};
const PORTRAITS = new Set(['victor','andrei','mihai','alex','diana','robert','ioana','radu','elena','cosmin','hantu','becali','ilie','sumudica','petrescu','stoica','prunea','porumboiu','ianis','dragusin','man','tamas','corina','scout']);

/** Presentation only: keep the agent identity, records and behavior intact when revealing its assigned model. */
export function aiCardIdentity(agent: Pick<AgentStat, 'id' | 'name' | 'title' | 'ownModel' | 'model'>) {
  const modelId = agent.ownModel ?? agent.model;
  const slash = modelId?.indexOf('/') ?? -1;
  const vendor = slash >= 0 ? modelId!.slice(0, slash) : '';
  const slug = slash >= 0 ? modelId!.slice(slash + 1) : modelId;
  const inferredVendor = slug?.startsWith('gemini-') ? 'google' : slug?.startsWith('gpt-') ? 'openai' : '';
  return {
    modelId,
    modelName: slug ? MODEL_NAMES[slug] ?? slug.replace(/[-_]/g, ' ') : 'Model neatribuit',
    company: PROVIDERS[vendor || inferredVendor] ?? (vendor || 'Model AI'),
    portrait: PORTRAITS.has(agent.id) ? `/ai-portraits/${agent.id}-v1.webp` : null,
    characterName: agent.name,
    role: agent.title.split(' · ')[0],
  };
}
