import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';
import { config } from '../config';
import { many, query, dialect, SQL_NOW, timeCompare, isD1 } from '../db';
import { aiUsageToday, recordProviderUsage } from '../usage';
import { OPENROUTER_PRICE } from './openrouter-models';
import { NEW_AI_PROFILES } from './new-agent-profiles';

export type Provider = 'groq' | 'gemini' | 'openrouter';
export type ModelRef = { provider: Provider; model: string };

export class RateLimitError extends Error {
  constructor(public provider: Provider, public retryAfterMs: number, public daily = false) {
    super(daily ? `Cota zilnică ${provider} este epuizată.` : `Limită de ritm ${provider}; reîncercare în ${Math.ceil(retryAfterMs / 1000)}s.`);
  }
}
export class BudgetExceededError extends Error {
  constructor(message: string) { super(message); }
}
export class ProviderUnavailableError extends Error {
  constructor(public provider: Provider, message: string) { super(message); }
}
export class SchemaError extends Error {
  constructor(message: string, public raw: string) { super(message); }
}

export function providerConfigured(p: Provider) {
  return p === 'groq' ? !!config.groqApiKey : p === 'gemini' ? !!config.geminiApiKey : !!config.openRouterApiKey;
}

// Pacing so a single instance stays inside free-tier limits. Groq free tier allows ~8,000 tokens/min
// per model; we read the provider's x-ratelimit headers and wait instead of triggering 429s.
const MIN_INTERVAL_MS: Record<Provider, number> = { groq: 2500, gemini: 7000, openrouter: 400 };
const lastCall = new Map<string, number>();
const tokenWindow = new Map<string, { remaining: number; resetAt: number }>();
const MAX_INLINE_WAIT_MS = 45_000;
const estimateTokens = (input: CallInput) => Math.ceil((input.system.length + input.user.length) / 3.2) + (input.maxOutputTokens ?? config.limits.maxOutputTokens);
async function pace(ref: ModelRef, input: CallInput) {
  const key = `${ref.provider}:${ref.model}`;
  let wait = (lastCall.get(key) ?? 0) + MIN_INTERVAL_MS[ref.provider] - Date.now();
  const tw = tokenWindow.get(key);
  if (tw && tw.resetAt > Date.now() && tw.remaining < estimateTokens(input)) wait = Math.max(wait, tw.resetAt - Date.now() + 500);
  if (wait > MAX_INLINE_WAIT_MS) throw new RateLimitError(ref.provider, wait);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall.set(key, Date.now());
}
function parseDuration(v: string | null) {
  if (!v) return null;
  let ms = 0;
  for (const m of v.matchAll(/([\d.]+)(ms|s|m|h)/g)) ms += Number(m[1]) * (m[2] === 'ms' ? 1 : m[2] === 's' ? 1000 : m[2] === 'm' ? 60_000 : 3_600_000);
  return ms || null;
}
function rememberLimits(ref: ModelRef, res: Response) {
  const remaining = Number(res.headers.get('x-ratelimit-remaining-tokens'));
  const reset = parseDuration(res.headers.get('x-ratelimit-reset-tokens'));
  if (Number.isFinite(remaining) && reset !== null) tokenWindow.set(`${ref.provider}:${ref.model}`, { remaining, resetAt: Date.now() + reset });
}

export type CallInput = { system: string; user: string; maxOutputTokens?: number; temperature?: number };
type RawResult = { text: string; inputTokens: number | null; outputTokens: number | null; resolvedModel: string };

function retryAfter(res: Response, body: string) {
  const header = res.headers.get('retry-after');
  if (header && Number.isFinite(Number(header))) return Number(header) * 1000;
  const m = body.match(/try again in ([\d.]+)(ms|s|m)/i);
  if (m) return Number(m[1]) * (m[2] === 'ms' ? 1 : m[2] === 'm' ? 60_000 : 1000);
  const g = body.match(/"retryDelay":\s*"(\d+)s"/);
  if (g) return Number(g[1]) * 1000;
  return 30_000;
}

/** OpenRouter models whose endpoint rejects `reasoning.enabled=false` (learned at runtime, e.g. GLM 5.3 Flash). */
const reasoningRequired = new Set<string>(['z-ai/glm-5.3-flash']);

async function callOpenAiCompatible(ref: ModelRef, input: CallInput, baseUrl: string, apiKey: string): Promise<RawResult> {
  const body: Record<string, unknown> = {
    model: ref.model,
    messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }],
    temperature: input.temperature ?? 0.3,
    max_completion_tokens: input.maxOutputTokens ?? config.limits.maxOutputTokens,
    response_format: { type: 'json_object' },
  };
  if (ref.provider === 'groq' && ref.model.startsWith('openai/gpt-oss')) { body.reasoning_effort = 'low'; body.include_reasoning = false; }
  if (ref.provider === 'groq' && ref.model.startsWith('qwen/')) { body.reasoning_effort = 'none'; }
  // Reasoning models would spend the whole output budget thinking; agents need the JSON, not the chain of thought.
  if (ref.provider === 'openrouter') {
    // Mandatory-reasoning models cannot disable thinking. Use their lowest supported effort,
    // omit reasoning text and leave room for JSON; reasoning still consumes billed output tokens.
    const effort = NEW_AI_PROFILES.find((a) => a.model === ref.model)?.reasoningEffort ?? (reasoningRequired.has(ref.model) ? 'low' : undefined);
    body.reasoning = effort ? { effort, exclude: true } : { enabled: false };
    body.max_completion_tokens = Math.min(8000, Math.max(Number(body.max_completion_tokens) || 0, 4000));
  }
  let reservation:string|null=null;
  if(ref.provider==='openrouter'&&isD1()&&!ref.model.endsWith(':free')){
    const {reservePaidCall,paidCallUpperEstimate}=await import('../d1/ai-budget');
    const amount=paidCallUpperEstimate(ref.model,input);
    if(amount===null)throw new ProviderUnavailableError('openrouter','Prețul modelului nu este configurat în catalogul de buget.');
    reservation=await reservePaidCall(ref.model,amount,config.openRouterDailyUsd);
    if(!reservation)throw new BudgetExceededError('Plafonul zilnic OpenRouter este rezervat de apelurile în desfășurare.');
  }
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ref.provider === 'openrouter' ? 120_000 : 90_000),
    });
  } catch (error) {
    if (reservation) { const { recordPaidCall } = await import('../d1/ai-budget'); await recordPaidCall(reservation, 0).catch(() => {}); }
    throw error;
  }
  const text = await res.text();
  rememberLimits(ref, res);
  // A refused call costs nothing: release its budget reservation instead of holding it until the day ends.
  if (!res.ok && reservation) { const { recordPaidCall } = await import('../d1/ai-budget'); await recordPaidCall(reservation, 0).catch(() => {}); reservation = null; }
  if (res.status === 413 || /request too large|reduce your message size/i.test(text)) throw new ProviderUnavailableError(ref.provider, `Cerere prea mare pentru limita ${ref.model}.`);
  if (res.status === 429) throw new RateLimitError(ref.provider, retryAfter(res, text), /per day|daily|TPD|RPD/i.test(text));
  // The OpenRouter key itself reached the spending limit set on openrouter.ai: every paid model fails until it is raised.
  if (ref.provider === 'openrouter' && (res.status === 403 || res.status === 402) && /key limit exceeded|insufficient credits|more credits/i.test(text)) {
    const e = new RateLimitError('openrouter', 15 * 60_000, false);
    e.message = 'Cheia OpenRouter a atins limita de cost setată pe openrouter.ai; agentul folosește modelul de rezervă până se mărește limita.';
    throw e;
  }
  if (res.status === 404 || res.status === 400 && /model/i.test(text) && /not (found|exist)|decommissioned/i.test(text)) throw new ProviderUnavailableError(ref.provider, `Model indisponibil: ${ref.model}`);
  if (ref.provider === 'openrouter' && res.status === 400 && /reasoning is mandatory/i.test(text) && !reasoningRequired.has(ref.model)) {
    // Some endpoints cannot switch thinking off: remember it and retry once with the lowest effort, reasoning hidden.
    reasoningRequired.add(ref.model);
    return callOpenAiCompatible(ref, input, baseUrl, apiKey);
  }
  if (!res.ok) throw new ProviderUnavailableError(ref.provider, `${ref.provider} ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { model?: string; choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  if(reservation){
    const {recordPaidCall,paidCallActual}=await import('../d1/ai-budget');
    const actual=paidCallActual(ref.model,json.usage?.prompt_tokens??null,json.usage?.completion_tokens??null);
    if(actual!==null)await recordPaidCall(reservation,actual);
  }
  return { text: json.choices?.[0]?.message?.content ?? '', inputTokens: json.usage?.prompt_tokens ?? null, outputTokens: json.usage?.completion_tokens ?? null, resolvedModel: json.model || ref.model };
}

async function callGemini(ref: ModelRef, input: CallInput): Promise<RawResult> {
  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    temperature: input.temperature ?? 0.3,
    maxOutputTokens: input.maxOutputTokens ?? config.limits.maxOutputTokens,
  };
  if (/2\.5-flash/.test(ref.model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  else if (/gemini-3/.test(ref.model) && !/lite/.test(ref.model)) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ref.model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: input.system }] }, contents: [{ role: 'user', parts: [{ text: input.user }] }], generationConfig }),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();
  if (res.status === 429) throw new RateLimitError('gemini', retryAfter(res, text), /PerDay|per day/i.test(text));
  if (res.status === 404) throw new ProviderUnavailableError('gemini', `Model indisponibil: ${ref.model}`);
  if (!res.ok) throw new ProviderUnavailableError('gemini', `gemini ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { modelVersion?: string; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
  return { text: json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '', inputTokens: json.usageMetadata?.promptTokenCount ?? null, outputTokens: json.usageMetadata?.candidatesTokenCount ?? null, resolvedModel: json.modelVersion || ref.model };
}

/** Test hook: replace real network inference with a deterministic fake. Never set in production. */
type FakeTransport = (ref: ModelRef, input: CallInput) => Promise<RawResult>;
const ag = globalThis as unknown as { __bmFakeAi?: FakeTransport | null; __bmAiCalls?: number };
export function setAiTransportForTests(t: FakeTransport | null) { ag.__bmFakeAi = t; exhaustedModels().clear(); }
/** Total inference attempts made by this process (real or fake). Used by tests to prove replay makes zero calls. */
export const aiCallCount = () => ag.__bmAiCalls ?? 0;

async function rawCall(ref: ModelRef, input: CallInput): Promise<RawResult> {
  ag.__bmAiCalls = (ag.__bmAiCalls ?? 0) + 1;
  if (ag.__bmFakeAi) return ag.__bmFakeAi(ref, input);
  if (!providerConfigured(ref.provider)) throw new ProviderUnavailableError(ref.provider, `Cheia ${ref.provider} nu este configurată.`);
  await pace(ref, input);
  if (ref.provider === 'gemini') {
    try { return await callGemini(ref, input); }
    catch (error) {
      // Gemini answers 503 "high demand" transiently; one short retry before any fallback.
      if (error instanceof ProviderUnavailableError && /503|high demand|UNAVAILABLE/i.test(error.message)) { await new Promise((r) => setTimeout(r, 4000)); return callGemini(ref, input); }
      throw error;
    }
  }
  if (ref.provider === 'groq') return callOpenAiCompatible(ref, input, 'https://api.groq.com/openai/v1', config.groqApiKey);
  // Slow OpenRouter routes time out or drop the connection now and then: retry a dropped connection once, then let the
  // chain move to the fallback instead of failing the agent's whole vote.
  for (let tryNo = 0; ; tryNo++) {
    try { return await callOpenAiCompatible(ref, input, 'https://openrouter.ai/api/v1', config.openRouterApiKey); }
    catch (error) {
      const network = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError' || /fetch failed|ECONNRESET|socket|terminated/i.test(error.message));
      if (!network) throw error;
      // A dropped connection fails fast and is worth one retry; a 2-minute timeout goes straight to the fallback.
      const timedOut = (error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError';
      if (tryNo === 0 && !timedOut) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      throw new ProviderUnavailableError('openrouter', `${ref.model} nu a răspuns la timp (${(error as Error).message}).`);
    }
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const start = trimmed.search(/[{[]/), end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  const body = start >= 0 ? trimmed.slice(start, end > start ? end + 1 : undefined) : trimmed;
  try { return JSON.parse(body); } catch { /* fall through */ }
  // Small models often emit near-JSON (trailing commas, a cut-off last element, unquoted keys): repair it
  // syntactically. The schema still validates every field, so nothing is invented.
  try { return JSON.parse(jsonrepair(start >= 0 ? trimmed.slice(start) : trimmed)); } catch { /* fall through */ }
  throw new Error('Răspunsul nu conține JSON.');
}

export type StructuredResult<T> = { data: T; provider: Provider; model: string; requestedModel: string; inputTokens: number | null; outputTokens: number | null; latencyMs: number; usedFallback: boolean };

/**
 * Calls one model with strict schema validation. One repair attempt on invalid output.
 * Fallback runs only when explicitly configured, and the actual model used is always returned.
 */
export async function structuredCall<T>(opts: {
  primary: ModelRef; fallback?: ModelRef | null; schema: z.ZodType<T>; input: CallInput;
  log: { jobId?: string | null; agentId?: string | null; stage: string };
}): Promise<StructuredResult<T>> {
  const usage = await aiUsageToday();
  if (usage.requests >= config.limits.aiDailyCalls) throw new BudgetExceededError(`Plafonul zilnic de apeluri AI (${config.limits.aiDailyCalls}) a fost atins.`);
  if (usage.tokens >= config.limits.aiDailyTokens) throw new BudgetExceededError(`Plafonul zilnic de tokeni AI (${config.limits.aiDailyTokens}) a fost atins.`);

  const attempt = async (ref: ModelRef, usedFallback: boolean): Promise<StructuredResult<T>> => {
    let input = opts.input;
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      const started = Date.now();
      let raw: RawResult | null = null;
      try {
        raw = await rawCall(ref, input);
        const parsed = opts.schema.safeParse(extractJson(raw.text));
        if (!parsed.success) throw new SchemaError(parsed.error.issues.slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), raw.text);
        await logCall(opts.log, ref, raw, true, true, Date.now() - started, null);
        return { data: parsed.data, provider: ref.provider, model: raw.resolvedModel, requestedModel: ref.model, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, latencyMs: Date.now() - started, usedFallback };
      } catch (error) {
        const schemaFailure = error instanceof SchemaError || (raw !== null && error instanceof Error && /JSON/.test(error.message));
        await logCall(opts.log, ref, raw, raw !== null, schemaFailure ? false : null, Date.now() - started, (error as Error).message);
        if (schemaFailure && tryNo === 0) {
          input = { ...input, user: `${input.user}\n\nRăspunsul anterior nu a respectat schema (${(error as Error).message.slice(0, 300)}). Răspunde DOAR cu un obiect JSON valid conform schemei.` };
          continue;
        }
        throw schemaFailure && !(error instanceof SchemaError) ? new SchemaError((error as Error).message, raw?.text ?? '') : error;
      }
    }
    throw new SchemaError('Răspuns invalid după reparare.', '');
  };

  const transient = (e: unknown) => e instanceof ProviderUnavailableError && /\b5\d\d\b|high demand|UNAVAILABLE|overloaded/i.test(e.message);
  // Candidate chain: primary → configured fallback → free reserve models. Exhausted models are skipped until their reset.
  const chain: ModelRef[] = [opts.primary, ...(opts.fallback ? [opts.fallback] : []), ...RESERVE_MODELS]
    .filter((m, i, all) => all.findIndex((x) => x.provider === m.provider && x.model === m.model) === i)
    .filter((m) => providerConfigured(m.provider));
  let shortestWait = Infinity;
  let lastError: unknown = null;
  await loadPersistedExhaustion();
  for (let i = 0; i < chain.length; i++) {
    const ref = chain[i];
    const key = `${ref.provider}:${ref.model}`;
    const exhausted = exhaustedModels();
    const until = exhausted.get(key) ?? 0;
    if (until > Date.now()) { shortestWait = Math.min(shortestWait, until - Date.now()); continue; }
    if (ref.provider === 'openrouter' && !(await openRouterBudgetLeft())) { lastError = new ProviderUnavailableError('openrouter', `Plafonul zilnic OpenRouter (${config.openRouterDailyUsd} USD) a fost atins.`); continue; }
    try {
      return await attempt(ref, i > 0);
    } catch (error) {
      lastError = error;
      if (error instanceof RateLimitError) {
        if (error.daily || error.retryAfterMs > 120_000) markExhausted(key, exhaustionUntil(ref, error), error.daily ? 'cota zilnică gratuită' : 'limită lungă');
        shortestWait = Math.min(shortestWait, error.retryAfterMs);
        // A short per-minute limit on the primary: wait for it rather than spreading to other models.
        if (!error.daily && error.retryAfterMs <= 120_000 && i === 0) throw error;
        continue;
      }
      if (transient(error)) { exhausted.set(key, Date.now() + 60_000); shortestWait = Math.min(shortestWait, 30_000); continue; }
      if(error instanceof BudgetExceededError&&ref.provider==='openrouter'){lastError=new ProviderUnavailableError('openrouter',error.message);continue;}
      if (error instanceof ProviderUnavailableError || error instanceof SchemaError) continue;
      throw error;
    }
  }
  if (Number.isFinite(shortestWait)) throw new RateLimitError(opts.primary.provider, Math.max(shortestWait, 5_000), shortestWait > 15 * 60_000);
  throw lastError ?? new ProviderUnavailableError(opts.primary.provider, 'Niciun model disponibil.');
}

/**
 * A manual resume clears short-lived blocks (rate limits, temporary overload) but keeps daily-quota exhaustion,
 * so already-spent free models are not retried on every resume.
 */
export function resetModelExhaustion() {
  const m = exhaustedModels();
  for (const [k, until] of m) if (until - Date.now() < 15 * 60_000) m.delete(k);
}

/** Estimated OpenRouter spend today (UTC), from logged tokens × catalogue prices; cached 20 s. */
let spendCache: { at: number; usd: number } | null = null;
export async function openRouterSpendToday(): Promise<number> {
  if (spendCache && Date.now() - spendCache.at < 20_000) return spendCache.usd;
  const rows = await many<{ model: string; i: string | null; o: string | null }>(
    `SELECT requested_model_id AS model, sum(input_tokens) AS i, sum(output_tokens) AS o FROM model_usage_logs
     WHERE provider='openrouter' AND ${timeCompare('created_at','>=',dialect("date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'", "strftime('%Y-%m-%dT00:00:00Z','now')"))} GROUP BY 1`).catch(() => []);
  const usd = rows.reduce((sum, r) => { const p = OPENROUTER_PRICE.get(r.model) ?? { inPerM: 1, outPerM: 3 }; return sum + (Number(r.i ?? 0) * p.inPerM + Number(r.o ?? 0) * p.outPerM) / 1e6; }, 0);
  spendCache = { at: Date.now(), usd };
  return usd;
}
async function openRouterBudgetLeft() { return (await openRouterSpendToday()) < config.openRouterDailyUsd; }

/** Tests only: simulates the providers' quota reset (e.g. the next day). */
export function clearModelExhaustionForTests() { exhaustedModels().clear(); }

/** Daily free quotas: Gemini resets at midnight Pacific (≈07:00/08:00 UTC); Groq's window is rolling (use its hint, ≥ 10 min). */
function exhaustionUntil(ref: ModelRef, e: RateLimitError) {
  if (!e.daily) return Date.now() + Math.max(e.retryAfterMs, 60_000);
  if (ref.provider === 'gemini') {
    const now = new Date();
    const pacificOffset = isPacificDst(now) ? 7 : 8;
    const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), pacificOffset, 0, 0));
    if (reset.getTime() <= now.getTime()) reset.setUTCDate(reset.getUTCDate() + 1);
    return reset.getTime();
  }
  return Date.now() + Math.max(e.retryAfterMs, 10 * 60_000);
}
function isPacificDst(d: Date) {
  const y = d.getUTCFullYear();
  const marchSecondSunday = Date.UTC(y, 2, 8 + ((7 - new Date(Date.UTC(y, 2, 8)).getUTCDay()) % 7), 10);
  const novFirstSunday = Date.UTC(y, 10, 1 + ((7 - new Date(Date.UTC(y, 10, 1)).getUTCDay()) % 7), 9);
  return d.getTime() >= marchSecondSunday && d.getTime() < novFirstSunday;
}

function markExhausted(key: string, until: number, reason: string) {
  exhaustedModels().set(key, until);
  if (ag.__bmFakeAi) return; // tests: in-memory only
  void query(`INSERT INTO model_health(model_key, exhausted_until, reason, updated_at) VALUES ($1, ${dialect('to_timestamp($2/1000.0)',"strftime('%Y-%m-%dT%H:%M:%fZ',$2/1000.0,'unixepoch')")}, $3, ${SQL_NOW()})
              ON CONFLICT (model_key) DO UPDATE SET exhausted_until=EXCLUDED.exhausted_until, reason=EXCLUDED.reason, updated_at=${SQL_NOW()}`, [key, until, reason]).catch(() => {});
}

let healthLoadedAt = 0;
/** Restores quota exhaustion recorded before a restart/deploy (cached 30 s). */
async function loadPersistedExhaustion() {
  if (ag.__bmFakeAi || Date.now() - healthLoadedAt < 30_000) return;
  healthLoadedAt = Date.now();
  try {
    const rows = await many<{ model_key: string; until: string }>(`SELECT model_key, ${dialect('extract(epoch from exhausted_until)*1000',"(julianday(exhausted_until)-2440587.5)*86400000")} AS until FROM model_health WHERE ${timeCompare('exhausted_until','>',SQL_NOW())}`);
    const m = exhaustedModels();
    for (const r of rows) m.set(r.model_key, Math.max(m.get(r.model_key) ?? 0, Number(r.until)));
  } catch { /* table missing or DB hiccup: in-memory state still applies */ }
}

/** Free models used, in order, when an agent's own models are exhausted. The model actually used is always recorded. */
export const RESERVE_MODELS: ModelRef[] = [
  { provider: 'gemini', model: 'gemini-3.1-flash-lite' },
  { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
  { provider: 'gemini', model: 'gemini-3-flash-preview' },
  { provider: 'groq', model: 'qwen/qwen3.8-27b' },
];
const exhaustedModels = () => ((globalThis as unknown as { __bmExhausted?: Map<string, number> }).__bmExhausted ??= new Map<string, number>());

async function logCall(log: { jobId?: string | null; agentId?: string | null; stage: string }, ref: ModelRef, raw: RawResult | null, ok: boolean, schemaValid: boolean | null, latencyMs: number, error: string | null) {
  const tokens = (raw?.inputTokens ?? 0) + (raw?.outputTokens ?? 0);
  await recordProviderUsage(ref.provider, { requests: 1, tokens, errors: error ? 1 : 0 });
  await query(
    `INSERT INTO model_usage_logs (job_id, agent_id, stage, provider, model_id, requested_model_id, ok, schema_valid, input_tokens, output_tokens, latency_ms, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [log.jobId ?? null, log.agentId ?? null, log.stage, ref.provider, raw?.resolvedModel ?? ref.model, ref.model, ok && !error, schemaValid, raw?.inputTokens ?? null, raw?.outputTokens ?? null, latencyMs, error?.slice(0, 500) ?? null],
  ).catch((e) => console.warn(JSON.stringify({ event: 'usage_log_failed', message: (e as Error).message })));
}
