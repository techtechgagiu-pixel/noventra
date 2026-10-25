import { describeModel } from '@/lib/model-identities';
import { cleanAgentText } from '@/lib/agent-names';
import { requireAdminPage } from '@/lib/admin-guard';
import { AGENTS } from '@/lib/ai/agents';
import { activeAssignments } from '@/lib/ai/assignments';
import { providerConfigured } from '@/lib/ai/router';
import { many } from '@/lib/db';
import { AdminTabs } from '@/components/admin-tabs';
import { ModelForm } from '@/components/model-form';

export const dynamic = 'force-dynamic';
export default async function AdminModels() {
  await requireAdminPage();
  const a = await activeAssignments();
  const stats = await many<{ agent_id: string; requests: number; avg_latency: number | null; tokens: number; error_rate: number | null }>(
    `SELECT agent_id, count(*)::int requests, avg(latency_ms)::int avg_latency, COALESCE(sum(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)),0)::int tokens, avg(CASE WHEN ok THEN 0 ELSE 1 END)::float error_rate
     FROM model_usage_logs WHERE created_at > now() - interval '30 days' GROUP BY agent_id`);
  const history = await many<{ agent_id: string; provider: string; model_id: string; reason: string | null; created_at: Date; active: boolean }>('SELECT agent_id, provider, model_id, reason, created_at, active FROM agent_model_assignments ORDER BY created_at DESC LIMIT 30');
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-bold">AI MODELS</h1><AdminTabs active="/admin/models" />
      <p className="text-sm text-muted">Valori citite din jurnalele salvate (ultimele 30 de zile). Deschiderea paginii nu rulează niciun model. Disponibilitatea = cheie configurată; nu este un test de inferență.</p>
      <div className="card overflow-x-auto p-4">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-muted"><tr><th className="py-2">Agent</th><th>Furnizor / model</th><th>Rezervă</th><th>Prompt</th><th>Disponibil</th><th>Latență medie</th><th>Cereri</th><th>Tokeni</th><th>Erori</th><th>Cost estimat</th></tr></thead>
          <tbody>{AGENTS.map((ag) => { const as = a.get(ag.id); const st = stats.find((s) => s.agent_id === ag.id); return (
            <tr key={ag.id} className="border-t border-line"><td className="py-2 font-semibold" style={{ color: ag.accent }}>{describeModel(as?.primary.model).modelName}<span className="block text-xs text-muted">{ag.title}</span></td><td>{as?.primary.provider}/{as?.primary.model}</td><td className="text-muted">{as?.fallback ? `${as.fallback.provider}/${as.fallback.model}` : '—'}</td><td>{as?.promptVersion}</td>
              <td>{as && providerConfigured(as.primary.provider) ? <span className="text-emerald">cheie OK</span> : <span className="text-rose">lipsă</span>}</td><td className="tabular">{st?.avg_latency ? `${(st.avg_latency / 1000).toFixed(1)} s` : '—'}</td><td className="tabular">{st?.requests ?? 0}</td><td className="tabular">{st?.tokens?.toLocaleString('ro-RO') ?? 0}</td><td className="tabular">{st?.error_rate != null ? `${Math.round(st.error_rate * 100)}%` : '—'}</td><td>0 USD (plan gratuit)</td></tr>); })}</tbody>
        </table>
      </div>
      <ModelForm agents={AGENTS.map((x) => ({ id: x.id, name: describeModel(a.get(x.id)?.primary.model).modelName, title: x.title }))} />
      <div className="card p-4"><h2 className="mb-2 font-display font-bold">Istoric versiuni</h2><ul className="space-y-1 text-xs text-muted">{history.map((h, i) => <li key={i}>{h.created_at.toISOString().slice(0, 16).replace('T', ' ')} · {AGENTS.find((ag) => ag.id === h.agent_id)?.title ?? 'Rol AI'} → {h.provider}/{h.model_id} {h.active ? '(activ)' : ''} · {cleanAgentText(h.reason)}</li>)}</ul></div>
    </div>
  );
}
