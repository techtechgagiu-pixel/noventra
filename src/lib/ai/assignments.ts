import { many, query, tx } from '../db';
import { AGENTS, PROMPT_VERSION, systemPrompt } from './agents';
import type { ModelRef, Provider } from './router';

export type Assignment = { agentId: string; primary: ModelRef; fallback: ModelRef | null; promptVersion: string };

let seeded = false;
/** Ensures prompt versions and a default model assignment exist (idempotent). */
export async function ensureAgentConfig() {
  if (seeded) return;
  for (const a of AGENTS) {
    await query('INSERT INTO agent_prompt_versions(agent_id, version, content) VALUES ($1,$2,$3) ON CONFLICT (agent_id, version) DO NOTHING', [a.id, PROMPT_VERSION, systemPrompt(a)]);
    await query(
      `INSERT INTO agent_model_assignments(agent_id, provider, model_id, fallback_provider, fallback_model_id, active, reason)
       SELECT $1,$2,$3,$4,$5,true,'Configurație implicită verificată în catalogul furnizorului'
       WHERE NOT EXISTS (SELECT 1 FROM agent_model_assignments WHERE agent_id=$1 AND active)`,
      [a.id, a.defaultModel.provider, a.defaultModel.model, a.defaultFallback?.provider ?? null, a.defaultFallback?.model ?? null],
    );
    // A system default (never edited by an admin) follows the code's current verified default, as a new version.
    await query(
      `WITH cur AS (SELECT id FROM agent_model_assignments WHERE agent_id=$1 AND active AND created_by IS NULL
         AND (provider, model_id, COALESCE(fallback_provider,''), COALESCE(fallback_model_id,'')) IS DISTINCT FROM ($2::text, $3::text, COALESCE($4::text,''), COALESCE($5::text,''))),
       off AS (UPDATE agent_model_assignments SET active=false WHERE id IN (SELECT id FROM cur) RETURNING id)
       INSERT INTO agent_model_assignments(agent_id, provider, model_id, fallback_provider, fallback_model_id, active, reason)
       SELECT $1,$2,$3,$4,$5,true,'Implicit actualizat: încărcare mutată pe Gemini pentru limita zilnică Groq (200k tokeni/model)' FROM off`,
      [a.id, a.defaultModel.provider, a.defaultModel.model, a.defaultFallback?.provider ?? null, a.defaultFallback?.model ?? null],
    );
  }
  seeded = true;
}

export async function activeAssignments(): Promise<Map<string, Assignment>> {
  await ensureAgentConfig();
  let rows = await loadRows();
  if (rows.length < AGENTS.length) { seeded = false; await ensureAgentConfig(); rows = await loadRows(); }
  return toMap(rows);
}
async function loadRows() {
  return many<{ agent_id: string; provider: Provider; model_id: string; fallback_provider: Provider | null; fallback_model_id: string | null }>(
    'SELECT agent_id, provider, model_id, fallback_provider, fallback_model_id FROM agent_model_assignments WHERE active',
  );
}
function toMap(rows: Awaited<ReturnType<typeof loadRows>>) {
  return new Map(rows.map((r) => [r.agent_id, {
    agentId: r.agent_id,
    primary: { provider: r.provider, model: r.model_id },
    fallback: r.fallback_provider && r.fallback_model_id ? { provider: r.fallback_provider, model: r.fallback_model_id } : null,
    promptVersion: PROMPT_VERSION,
  }]));
}

/** Versioned change: the previous assignment is deactivated, never edited. */
export async function updateAssignment(agentId: string, primary: ModelRef, fallback: ModelRef | null, userId: string, reason: string) {
  await tx(async (c) => {
    await c.query('UPDATE agent_model_assignments SET active=false WHERE agent_id=$1 AND active', [agentId]);
    await c.query(
      'INSERT INTO agent_model_assignments(agent_id, provider, model_id, fallback_provider, fallback_model_id, active, reason, created_by) VALUES ($1,$2,$3,$4,$5,true,$6,$7)',
      [agentId, primary.provider, primary.model, fallback?.provider ?? null, fallback?.model ?? null, reason, userId],
    );
    await c.query("INSERT INTO audit_logs(user_id, action, detail) VALUES ($1,'model_assignment_changed',$2)", [userId, JSON.stringify({ agentId, primary, fallback, reason })]);
  });
}
