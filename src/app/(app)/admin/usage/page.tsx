import { requireAdminPage } from '@/lib/admin-guard';
import { many, one } from '@/lib/db';
import { config } from '@/lib/config';
import { AdminTabs } from '@/components/admin-tabs';

export const dynamic = 'force-dynamic';
export default async function Usage() {
  await requireAdminPage();
  const usage = await many<{ provider: string; day: string; requests: number; tokens: number; errors: number }>("SELECT provider, to_char(day,'YYYY-MM-DD') day, requests, tokens, errors FROM provider_usage WHERE day > current_date - 14 ORDER BY day DESC, provider");
  const jobs = await many<{ status: string; n: number }>('SELECT status, count(*)::int n FROM ticket_generation_jobs GROUP BY status');
  const db = await one<{ size: string }>('SELECT pg_size_pretty(pg_database_size(current_database())) size');
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-bold">Consum & cote</h1><AdminTabs active="/admin/usage" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-4"><p className="text-xs text-muted">Bază de date (Neon Free 0,5 GB)</p><p className="font-display text-2xl font-bold">{db?.size}</p></div>
        <div className="card p-4"><p className="text-xs text-muted">Plafoane AI / zi (aplicație)</p><p className="text-sm">{config.limits.aiDailyCalls} apeluri · {config.limits.aiDailyTokens.toLocaleString('ro-RO')} tokeni</p></div>
        <div className="card p-4"><p className="text-xs text-muted">Joburi</p><p className="text-sm">{jobs.map((j) => `${j.status}: ${j.n}`).join(' · ') || '—'}</p></div>
      </div>
      <div className="card overflow-x-auto p-4"><table className="w-full text-sm"><thead className="text-left text-muted"><tr><th className="py-1">Zi (UTC)</th><th>Furnizor</th><th>Cereri</th><th>Tokeni</th><th>Erori</th></tr></thead>
        <tbody>{usage.map((u, i) => <tr key={i} className="border-t border-line"><td className="py-1.5">{u.day}</td><td>{u.provider}</td><td className="tabular">{u.requests}</td><td className="tabular">{u.tokens.toLocaleString('ro-RO')}</td><td className="tabular">{u.errors}</td></tr>)}</tbody></table></div>
      <p className="text-xs text-muted">Limite furnizori (verificate pe 19.10.2026): Groq Free ~8.000 tokeni/min și 1.000 cereri/zi per model; Gemini Free limite pe minut/zi per model; ESPN public fără SLA. Plafoanele aplicației nu măsoară consumul altor aplicații din aceleași conturi.</p>
    </div>
  );
}
