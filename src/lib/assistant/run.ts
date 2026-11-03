import { config } from '../config';
import { one, query } from '../db';
import { AGENT_META } from '../format';
import { toolSpecs, runTool, type ToolCtx } from './tools';

/**
 * Site assistant (owner request 03.11): answers any question about PRIMUL 11 from the app's own data, through the
 * read-only tools in tools.ts. Main model: Claude Haiku 5.5 on OpenRouter, under its own daily cap
 * (ASSISTANT_DAILY_USD, default $0.50, owner decision); over the cap it answers with a free Groq model.
 */
export const ASSISTANT_MODEL = 'anthropic/claude-haiku-5.5';
const PRICE = { inPerToken: 0.1, outPerToken: 0.5 }; // micro-USD per token ($0.10 / $0.50 per million)
// Free fallback: Gemini through its OpenAI-compatible endpoint (Groq's free tier allows only ~8k tokens a minute,
// less than one answer with statistics, 03.11).
const FREE = { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-3.1-flash-lite' };
const dailyUsd = () => Number(process.env.ASSISTANT_DAILY_USD || '0.5');
const MAX_ROUNDS = 6;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Msg = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>; tool_call_id?: string };

const utcDay = () => new Date().toISOString().slice(0, 10);
const roster = () => Object.entries(AGENT_META).map(([id, a]) => `${id} = ${a.name} (${a.title})`).join('; ');

const system = (ctx: ToolCtx) => `Ești asistentul site-ului PRIMUL 11 (primul11.noventra.ro): o echipă de agenți AI care analizează meciuri de fotbal și Counter-Strike 2 la cotele Stake, dezbat și votează bilete.
Răspunzi în română, scurt și concret, ca un analist care cunoaște platforma. Folosește uneltele ca să citești datele reale (bilete, agenți, meciuri, cote, statistici) înainte să răspunzi la orice întrebare despre ele; nu inventa cifre, meciuri sau rezultate. Dacă datele nu există, spune asta.
Reguli: nu promiți câștiguri și nu spui că un pronostic e sigur; analizele nu garantează rezultate (18+). Nu poți plasa pariuri și nu poți modifica nimic în aplicație; dacă ți se cere, explici unde din site se face. Nu dezvălui adrese de e-mail.
Agenții (id = nume): ${roster()}.
Reguli ale aplicației bune de știut: pronosticurile „sub” și șansa dublă „12” sunt interzise; un bilet custom are cel mult jumătate din meciuri pe același tip de pronostic (altfel se face cu cota cea mai apropiată); cotele Stake sunt folosite 24 de ore de la export; agenții slabi intră „în antrenament” (limite mai stricte, tipuri de pariu închise).
Utilizatorul ${ctx.owner ? 'este proprietarul site-ului' : 'este un utilizator obișnuit'}. Data de azi: ${new Date().toISOString().slice(0, 10)}. Folosește cifre exacte din unelte, formatate pe scurt (liste sau un tabel mic doar când ajută).`;

async function spentToday() {
  const r = await one<{ microusd: number | string }>('SELECT microusd FROM assistant_usage WHERE day=$1', [utcDay()]).catch(() => null);
  return Number(r?.microusd ?? 0) / 1e6;
}
async function record(microusd: number, question: boolean) {
  await query(`INSERT INTO assistant_usage(day,microusd,questions) VALUES($1,$2,$3) ON CONFLICT(day) DO UPDATE SET microusd=assistant_usage.microusd+EXCLUDED.microusd, questions=assistant_usage.questions+EXCLUDED.questions`,
    [utcDay(), Math.ceil(microusd), question ? 1 : 0]).catch(() => {});
}

async function complete(messages: Msg[], paid: boolean) {
  const url = paid ? 'https://openrouter.ai/api/v1/chat/completions' : FREE.url;
  const key = paid ? config.openRouterApiKey : config.geminiApiKey;
  if (!key) throw new Error('Asistentul nu are cheie pentru modelul AI.');
  const body: Record<string, unknown> = { model: paid ? ASSISTANT_MODEL : FREE.model, messages, tools: toolSpecs(), tool_choice: 'auto', temperature: 0.2, max_tokens: 1400 };
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'PRIMUL 11 asistent' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  const json = await res.json().catch(() => ({})) as { choices?: Array<{ message?: Msg }>; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message?.slice(0, 160) || `Modelul AI a răspuns ${res.status}.`);
  if (paid) await record((json.usage?.prompt_tokens ?? 0) * PRICE.inPerToken + (json.usage?.completion_tokens ?? 0) * PRICE.outPerToken, false);
  const msg = json.choices?.[0]?.message;
  if (!msg) throw new Error('Răspuns gol de la modelul AI.');
  return msg;
}

/** One answer: the model may call tools (at most MAX_ROUNDS rounds), then writes the reply. */
export async function askAssistant(history: ChatMessage[], ctx: ToolCtx) {
  const paid = (await spentToday()) < dailyUsd() && !!config.openRouterApiKey;
  // A refused paid call (03.11: the OpenRouter key had hit its total limit) answers with the free model instead.
  if (paid) { try { return await answer(history, ctx, true); } catch { /* fall through to the free model */ } }
  return answer(history, ctx, false);
}

async function answer(history: ChatMessage[], ctx: ToolCtx, paid: boolean) {
  const messages: Msg[] = [{ role: 'system', content: system(ctx) }, ...history.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))];
  const used: string[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const msg = await complete(messages, paid);
    if (!msg.tool_calls?.length) {
      await record(0, true);
      return { answer: (msg.content ?? '').trim() || 'Nu am găsit un răspuns.', model: paid ? ASSISTANT_MODEL : `gemini/${FREE.model}`, tools: used };
    }
    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls.slice(0, 4)) {
      used.push(call.function.name);
      const out = await runTool(call.function.name, call.function.arguments, ctx);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out) });
    }
  }
  await record(0, true);
  return { answer: 'Întrebarea a cerut prea multe căutări deodată. Încearcă una mai precisă.', model: paid ? ASSISTANT_MODEL : `gemini/${FREE.model}`, tools: used };
}
