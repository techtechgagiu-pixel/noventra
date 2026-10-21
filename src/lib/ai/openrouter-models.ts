import type { ModelRef } from './router';

/**
 * One model per agent, twelve different vendors, all verified on OpenRouter (2026-10-21) to support JSON output.
 * Active only when OPENROUTER_API_KEY is set; the agent's free Gemini/Groq model then becomes its fallback.
 * Prices: USD per million tokens (input / output) from the OpenRouter catalogue, used for the daily spend cap.
 */
export const OPENROUTER_MODELS: Record<string, { model: string; inPerM: number; outPerM: number }> = {
  victor: { model: 'anthropic/claude-haiku-5.5', inPerM: 0.1, outPerM: 0.5 },
  andrei: { model: 'deepseek/deepseek-v4.1-flash', inPerM: 0.049, outPerM: 0.375 },
  mihai: { model: 'openai/gpt-6-luna', inPerM: 0.1, outPerM: 0.5 },
  alex: { model: 'xiaomi/mimo-v2.6-flash', inPerM: 0.14, outPerM: 0.28 },
  diana: { model: 'z-ai/glm-5.3-flash', inPerM: 0.041, outPerM: 0.12 },
  // Mircea Lucescu is also the team's brain: one strong model for both his vote and his decisions (2026-10-21).
  robert: { model: 'openai/gpt-6-luna-pro', inPerM: 0.1, outPerM: 0.5 },
  ioana: { model: 'qwen/qwen3.8-flash', inPerM: 0.15, outPerM: 0.47 },
  radu: { model: 'meta-llama/llama-4-maverick', inPerM: 0.188, outPerM: 0.652 },
  elena: { model: 'google/gemma-4-31b-it', inPerM: 0.2, outPerM: 0.4 },
  cosmin: { model: 'tencent/hy3', inPerM: 0.132, outPerM: 0.528 },
  hantu: { model: 'nvidia/nemotron-3.5-super-vl', inPerM: 0.15, outPerM: 0.5 },
  becali: { model: 'x-ai/grok-4.3', inPerM: 1.25, outPerM: 2.5 },
};

export const OPENROUTER_PRICE = new Map(Object.values(OPENROUTER_MODELS).map((m) => [m.model, m]));

export function openRouterDefault(agentId: string, freeDefault: ModelRef): { primary: ModelRef; fallback: ModelRef } | null {
  const m = OPENROUTER_MODELS[agentId];
  return m ? { primary: { provider: 'openrouter', model: m.model }, fallback: freeDefault } : null;
}
