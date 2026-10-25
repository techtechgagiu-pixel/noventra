import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, json, requireAdmin, sameOrigin } from '@/lib/http';
import { AGENTS } from '@/lib/ai/agents';
import { activeAssignments, updateAssignment } from '@/lib/ai/assignments';
import { many, SQL_AGO, timeCompare } from '@/lib/db';

export const dynamic = 'force-dynamic';
/** Reads stored metrics only. Opening this page never triggers inference. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const a = await activeAssignments();
  const stats = await many<Record<string, unknown>>(
    `SELECT agent_id,provider,model_id,CAST(count(*) AS INTEGER) AS requests,CAST(avg(latency_ms) AS INTEGER) AS avg_latency,CAST(sum(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)) AS INTEGER) AS tokens,
            CAST(avg(CASE WHEN ok THEN 0 ELSE 1 END) AS DOUBLE PRECISION) AS error_rate,CAST(avg(CASE WHEN schema_valid IS FALSE THEN 1 ELSE 0 END) AS DOUBLE PRECISION) AS invalid_rate
     FROM model_usage_logs WHERE ${timeCompare('created_at','>',SQL_AGO(30,'days'))} GROUP BY agent_id,provider,model_id ORDER BY agent_id`,
  );
  const history = await many<Record<string, unknown>>('SELECT agent_id, provider, model_id, fallback_provider, fallback_model_id, active, reason, created_at FROM agent_model_assignments ORDER BY created_at DESC LIMIT 100');
  const evaluated = await many<Record<string, unknown>>(
    `SELECT p.agent_id,p.model_id,CAST(count(*) AS INTEGER) AS n,
            CAST(avg(CASE WHEN s.outcome='WON' THEN 1 WHEN s.outcome='LOST' THEN 0 END) AS DOUBLE PRECISION) AS hit_rate,
            CAST(avg(CASE WHEN s.outcome IN ('WON','LOST') THEN (p.estimated_probability-CASE WHEN s.outcome='WON' THEN 1 ELSE 0 END)*(p.estimated_probability-CASE WHEN s.outcome='WON' THEN 1 ELSE 0 END) END) AS DOUBLE PRECISION) AS brier
     FROM agent_predictions p JOIN ticket_selections s ON s.fixture_id=p.fixture_id AND s.market_key=p.market_key
     JOIN tickets t ON t.id=s.ticket_id AND t.job_id=p.job_id
     WHERE p.decision='BET_CANDIDATE' AND s.outcome IN ('WON','LOST') GROUP BY p.agent_id, p.model_id`,
  );
  return json({ agents: AGENTS.map((x) => ({ id: x.id, name: x.name, assignment: a.get(x.id) ?? null })), stats, history, evaluated, pricing: 'Planuri gratuite Groq/Gemini: cost estimat 0 USD; limitele furnizorului se aplică.' });
}

const Body = z.object({ agentId: z.string(), provider: z.enum(['groq', 'gemini', 'openrouter']), model: z.string().min(2).max(120), fallbackProvider: z.enum(['groq', 'gemini', 'openrouter']).nullable().optional(), fallbackModel: z.string().max(120).nullable().optional(), reason: z.string().min(3).max(300) });
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Origine respinsă.', 403);
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success || !AGENTS.some((a) => a.id === p.data.agentId)) return fail('Date invalide.');
  await updateAssignment(p.data.agentId, { provider: p.data.provider, model: p.data.model }, p.data.fallbackProvider && p.data.fallbackModel ? { provider: p.data.fallbackProvider, model: p.data.fallbackModel } : null, admin.id, p.data.reason);
  return json({ ok: true });
}
