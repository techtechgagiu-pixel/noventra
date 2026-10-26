import { NEW_AI_PROFILES } from './ai/new-agent-profiles';
import { OPENROUTER_MODELS } from './ai/openrouter-models';

const MODEL_NAMES: Record<string, string> = {
  'gpt-oss-20b': 'GPT-OSS 20B', 'gpt-oss-120b': 'GPT-OSS 120B', 'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
  'gemini-3.6-flash': 'Gemini 3.6 Flash', 'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite', 'qwen3.8-27b': 'Qwen 3.8 27B',
  ...Object.fromEntries(NEW_AI_PROFILES.map((a) => [a.model.slice(a.model.indexOf('/') + 1), a.modelName])),
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
  'nex-agi': 'NEX AGI', inclusionai: 'InclusionAI', minimax: 'MiniMax',
};

export function describeModel(modelId: string | null | undefined) {
  const slash = modelId?.indexOf('/') ?? -1;
  const vendor = slash >= 0 ? modelId!.slice(0, slash) : '';
  const slug = slash >= 0 ? modelId!.slice(slash + 1) : modelId;
  const inferredVendor = slug?.startsWith('gemini-') ? 'google' : slug?.startsWith('gpt-') ? 'openai' : '';
  return { modelId: modelId ?? null, modelName: slug ? MODEL_NAMES[slug] ?? slug.replace(/[-_]/g, ' ') : 'Model neatribuit', company: PROVIDERS[vendor || inferredVendor] ?? (vendor || 'Model AI') };
}

export function configuredModelId(id: string): string | null {
  return OPENROUTER_MODELS[id]?.model ?? (id === 'scout' ? 'gemini-3.1-flash-lite' : null);
}
export function modelAgentName(id: string) { return describeModel(configuredModelId(id)).modelName; }
export const AGENT_ROLES: Record<string, string> = {
  "victor": "Strategul",
  "andrei": "Matematicianul",
  "mihai": "Veteranul",
  "alex": "Vânătorul de cote",
  "diana": "Tacticianul",
  "robert": "Managerul de risc",
  "ioana": "Specialistul în goluri",
  "radu": "Analistul acasă/deplasare",
  "elena": "Statisticianul bayesian",
  "cosmin": "Analistul de piață",
  "hantu": "Omul de știri",
  "becali": "Patronul",
  "ilie": "Profesorul de tactică",
  "sumudica": "Nebunul de serviciu",
  "petrescu": "Generalul defensiv",
  "stoica": "Avocatul diavolului",
  "prunea": "Gardianul porții",
  "porumboiu": "Judecătorul VAR",
  "ianis": "Creatorul de ocazii",
  "dragusin": "Zidul de fier",
  "man": "Vânătorul de spații",
  "tamas": "Detectorul de haos",
  "corina": "Redacția sportivă",
  "scout": "Cercetare istorică",
  "nova": "Contrarianul AI",
  "sigma": "Auditorul statistic",
  "atlas": "Analistul de actualitate",
  "argus": "Criticul dovezilor",
  "orion": "Auditorul regulilor",
  "prisma": "Interpreta piețelor",
  "mnemos": "Memoria dezbaterii",
  "nexus": "Mediatorul AI",
  "vector": "Analistul de scenarii",
  "fulger": "Inspectorul rapid"
};
export function modelPortrait(id: string): string | null {
  return id in AGENT_ROLES ? `/ai-portraits/${id}-v1.webp` : null;
}
