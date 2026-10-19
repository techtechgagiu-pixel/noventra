import { requireAdminPage } from '@/lib/admin-guard';
import { many } from '@/lib/db';
import { AdminTabs } from '@/components/admin-tabs';

export const dynamic = 'force-dynamic';
/** MODEL ARENA — stored metrics only; no inference on open. */
export default async function Arena() {
  await requireAdminPage();
  const ops = await many<{ provider: string; model_id: string; agents: string; requests: number; ok_rate: number; valid_rate: number | null; avg_latency: number | null; tokens: number }>(
    `SELECT provider, model_id, string_agg(DISTINCT agent_id, ', ') agents, count(*)::int requests, avg(CASE WHEN ok THEN 1 ELSE 0 END)::float ok_rate,
            avg(CASE WHEN schema_valid THEN 1 WHEN schema_valid IS FALSE THEN 0 END)::float valid_rate, avg(latency_ms)::int avg_latency, COALESCE(sum(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)),0)::int tokens
     FROM model_usage_logs GROUP BY provider, model_id ORDER BY requests DESC`);
  const evals = await many<{ agent_id: string; model_id: string; prompt_version: string; n: number; hit: number | null; brier: number | null }>(
    `SELECT p.agent_id, p.model_id, p.prompt_version, count(*)::int n, avg(CASE WHEN s.outcome='WON' THEN 1 ELSE 0 END)::float hit,
            avg(power(p.estimated_probability - CASE WHEN s.outcome='WON' THEN 1 ELSE 0 END, 2))::float brier
     FROM agent_predictions p JOIN tickets t ON t.job_id=p.job_id JOIN ticket_selections s ON s.ticket_id=t.id AND s.fixture_id=p.fixture_id AND s.market_key=p.market_key
     WHERE p.decision='BET_CANDIDATE' AND s.outcome IN ('WON','LOST') AND p.estimated_probability IS NOT NULL GROUP BY 1,2,3 ORDER BY n DESC`);
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-bold">MODEL ARENA</h1><AdminTabs active="/admin/evaluation" />
      <div className="card overflow-x-auto p-4"><h2 className="mb-2 font-display font-bold">Operare</h2><table className="w-full min-w-[700px] text-sm"><thead className="text-left text-muted"><tr><th className="py-1">Model</th><th>Agenți</th><th>Cereri</th><th>Succes</th><th>JSON valid</th><th>Latență</th><th>Tokeni</th><th>Cost</th></tr></thead>
        <tbody>{ops.map((o) => <tr key={o.provider + o.model_id} className="border-t border-line"><td className="py-1.5">{o.provider}/{o.model_id}</td><td>{o.agents}</td><td className="tabular">{o.requests}</td><td className="tabular">{Math.round(o.ok_rate * 100)}%</td><td className="tabular">{o.valid_rate != null ? Math.round(o.valid_rate * 100) + '%' : '—'}</td><td className="tabular">{o.avg_latency ? (o.avg_latency / 1000).toFixed(1) + ' s' : '—'}</td><td className="tabular">{o.tokens.toLocaleString('ro-RO')}</td><td>0 USD</td></tr>)}</tbody></table></div>
      <div className="card overflow-x-auto p-4"><h2 className="mb-2 font-display font-bold">Calibrare pe rezultate reale</h2><table className="w-full text-sm"><thead className="text-left text-muted"><tr><th className="py-1">Agent</th><th>Model</th><th>Prompt</th><th>Predicții evaluate</th><th>Rată reușită</th><th>Brier</th></tr></thead>
        <tbody>{evals.map((e, i) => <tr key={i} className="border-t border-line"><td className="py-1.5">{e.agent_id}</td><td>{e.model_id}</td><td>{e.prompt_version}</td><td className="tabular">{e.n}</td><td className="tabular">{e.hit != null ? Math.round(e.hit * 100) + '%' : '—'}</td><td className="tabular">{e.brier?.toFixed(3) ?? '—'}</td></tr>)}</tbody></table>
        <p className="mt-3 text-xs text-muted">Doar selecțiile incluse în bilete și decise sunt evaluate. Sub ~100 de predicții, diferențele nu sunt semnificative statistic. Promptul de producție nu se schimbă automat pe baza acestor cifre; orice benchmark necesită inițiere explicită de către administrator.</p></div>
    </div>
  );
}
