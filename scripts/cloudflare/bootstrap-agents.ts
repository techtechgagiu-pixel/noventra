// Offline public configuration only; never invokes a provider or embeds keys.
import { writeFile } from 'node:fs/promises';
import { AGENTS, PROMPT_VERSION, systemPrompt } from '../../src/lib/ai/agents';
import { openRouterDefault } from '../../src/lib/ai/openrouter-models';

const quote = (s: string | number | boolean | null) => s === null ? 'NULL' : typeof s === 'boolean' ? String(Number(s)) : typeof s === 'number' ? String(s) : "'" + s.replaceAll("'", "''") + "'";
const output = process.argv[2];
if (!output) throw new Error('Pass a new SQL output path');
const statements = ['-- Public agent identities/prompts only. Generated from code; no accounts, keys or predictions.'];
for (const a of AGENTS) {
  const ref = openRouterDefault(a.id, a.defaultModel) ?? { primary: a.defaultModel, fallback: a.defaultFallback };
  statements.push(`INSERT INTO agents(id,name,title,risk_preference,voting,accent) VALUES(${[a.id,a.name,a.title,a.risk,a.id !== 'scout' && a.id !== 'corina',a.accent].map(quote)}) ON CONFLICT(id) DO NOTHING;`);
  statements.push(`INSERT INTO agent_prompt_versions(agent_id,version,content) VALUES(${[a.id,PROMPT_VERSION,systemPrompt(a)].map(quote)}) ON CONFLICT(agent_id,version) DO NOTHING;`);
  statements.push(`INSERT INTO agent_model_assignments(agent_id,provider,model_id,fallback_provider,fallback_model_id,active,reason) SELECT ${[a.id,ref.primary.provider,ref.primary.model,ref.fallback?.provider ?? null,ref.fallback?.model ?? null,true,'D1 bootstrap: configurație din cod'].map(quote)} WHERE NOT EXISTS(SELECT 1 FROM agent_model_assignments WHERE agent_id=${quote(a.id)} AND active);`);
}
await writeFile(output, statements.join('\n') + '\n', { flag: 'wx' });
console.log(JSON.stringify({ agents: AGENTS.length, promptVersion: PROMPT_VERSION }));
