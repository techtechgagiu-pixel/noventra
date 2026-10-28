import type { ModelRef } from './router';
import { NEW_AI_PROFILES } from './new-agent-profiles';

/**
 * One model per agent; original roster verified 2026-10-21, ten AI profiles added 2026-10-25.
 * Active only when OPENROUTER_API_KEY is set; the agent's free Gemini/Groq model then becomes its fallback.
 * Prices: USD per million tokens (input / output) from the OpenRouter catalogue, used for the daily spend cap.
 */
export const OPENROUTER_MODELS: Record<string, { model: string; inPerM: number; outPerM: number }> = {
  ...Object.fromEntries(NEW_AI_PROFILES.map((a) => [a.id, { model: a.model, inPerM: a.inPerM, outPerM: a.outPerM }])),
  // Corina: sourced sports reporting; catalogue checked 2026-10-22.
  corina: { model: 'anthropic/claude-haiku-5.5', inPerM: 0.1, outPerM: 0.5 },
  victor: { model: 'anthropic/claude-haiku-5.5', inPerM: 0.1, outPerM: 0.5 },
  andrei: { model: 'deepseek/deepseek-v4.1-flash', inPerM: 0.14, outPerM: 0.42 },
  mihai: { model: 'openai/gpt-6-luna', inPerM: 0.1, outPerM: 0.5 },
  alex: { model: 'xiaomi/mimo-v2.6-flash', inPerM: 0.14, outPerM: 0.28 },
  diana: { model: 'z-ai/glm-5.3-flash', inPerM: 0.15, outPerM: 0.5 },
  // GPT-6 Luna Pro is also the team's brain: one strong model for both his vote and his decisions (2026-10-21).
  robert: { model: 'openai/gpt-6-luna-pro', inPerM: 0.1, outPerM: 0.5 },
  ioana: { model: 'qwen/qwen3.8-flash', inPerM: 0.15, outPerM: 0.47 },
  radu: { model: 'meta-llama/llama-4-maverick', inPerM: 0.188, outPerM: 0.652 },
  elena: { model: 'google/gemma-4-31b-it', inPerM: 0.2, outPerM: 0.4 },
  cosmin: { model: 'tencent/hy3', inPerM: 0.132, outPerM: 0.528 },
  hantu: { model: 'nvidia/nemotron-3.5-super-vl', inPerM: 0.15, outPerM: 0.5 },
  becali: { model: 'deepseek/deepseek-v4-flash', inPerM: 0.091, outPerM: 0.182 },
  // Echipa a doua (2026-10-21) — fiecare agent își păstrează modelul, ca rezultatele lunare să fie comparabile.
  ilie: { model: 'mistralai/mistral-small-3.2-24b-instruct', inPerM: 0.075, outPerM: 0.2 },
  sumudica: { model: 'upstage/solar-mini4', inPerM: 0.05, outPerM: 0.2 },
  petrescu: { model: 'cohere/command-r-08-2024', inPerM: 0.15, outPerM: 0.6 },
  stoica: { model: 'qwen/qwen3-235b-a22b-2507', inPerM: 0.09, outPerM: 0.55 },
  prunea: { model: 'bytedance-seed/seed-2.0-mini', inPerM: 0.1, outPerM: 0.4 },
  porumboiu: { model: 'upstage/solar-pro4', inPerM: 0.15, outPerM: 0.6 },
  ianis: { model: 'inception/mercury-3', inPerM: 0.1, outPerM: 0.35 },
  dragusin: { model: 'nex-agi/nex-n2.5-pro', inPerM: 0.075, outPerM: 0.25 },
  man: { model: 'inclusionai/ling-3.1-flash', inPerM: 0.075, outPerM: 0.225 },
  tamas: { model: 'deepseek/deepseek-v4.1-flash-1017', inPerM: 0.15, outPerM: 0.6 },
};

export const OPENROUTER_PRICE = new Map(Object.values(OPENROUTER_MODELS).map((m) => [m.model, m]));

export function openRouterDefault(agentId: string, freeDefault: ModelRef): { primary: ModelRef; fallback: ModelRef } | null {
  const m = OPENROUTER_MODELS[agentId];
  return m ? { primary: { provider: 'openrouter', model: m.model }, fallback: freeDefault } : null;
}
