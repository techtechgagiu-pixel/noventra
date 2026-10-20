import { currentUser } from '@/lib/auth';
import { many, one } from '@/lib/db';
import { VOTING_AGENTS } from '@/lib/ai/agents';
import { allTrackRecords } from '@/lib/track-record';

export const dynamic = 'force-dynamic';
export default async function Performance() {
  const user = (await currentUser())!;
  const t = (await one<Record<string, number>>(
    `SELECT count(*)::int total, count(*) FILTER (WHERE generation_status='COMPLETED')::int completed, count(*) FILTER (WHERE generation_status='INCOMPLETE')::int incomplete, count(*) FILTER (WHERE generation_status='NO_BET')::int nobet,
            count(*) FILTER (WHERE outcome_status='WON')::int won, count(*) FILTER (WHERE outcome_status='LOST')::int lost, count(*) FILTER (WHERE outcome_status='PENDING')::int pending,
            COALESCE(sum(CASE WHEN outcome_status='WON' THEN actual_odds-1 WHEN outcome_status='LOST' THEN -1 ELSE 0 END),0)::float units FROM tickets WHERE user_id=$1`, [user.id]))!;
  const m = await many<{ market: string; n: number; won: number; lost: number; brier: number | null }>(
    `SELECT split_part(s.market_key,':',1) market, count(*)::int n, count(*) FILTER (WHERE s.outcome='WON')::int won, count(*) FILTER (WHERE s.outcome='LOST')::int lost,
            avg(power(s.model_probability - CASE WHEN s.outcome='WON' THEN 1 ELSE 0 END, 2)) FILTER (WHERE s.outcome IN ('WON','LOST'))::float brier
     FROM ticket_selections s JOIN tickets tt ON tt.id=s.ticket_id WHERE tt.user_id=$1 GROUP BY 1 ORDER BY 2 DESC`, [user.id]);
  const records = new Map((await allTrackRecords(VOTING_AGENTS.map((a) => a.id)).catch(() => [])).map((r) => [r.id, r.record]));
  const settled = t.won + t.lost;
  const stat = (label: string, v: string | number, tone = '') => <div className="card p-4"><p className="text-xs text-muted">{label}</p><p className={`font-display text-3xl font-bold tabular ${tone}`}>{v}</p></div>;
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-bold">Performanță</h1>
      <p className="max-w-2xl text-sm text-muted">Rezultatele sunt actualizate automat, fără AI, după încheierea meciurilor. Afișăm și biletele pierdute. Un eșantion mic nu spune nimic despre calitatea pe termen lung.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat('Bilete generate', t.total)}{stat('Complete / incomplete / NO BET', `${t.completed} / ${t.incomplete} / ${t.nobet}`)}
        {stat('Câștigate / pierdute', `${t.won} / ${t.lost}`, settled ? '' : 'text-muted')}{stat('Unități ipotetice (miză 1)', settled ? (t.units >= 0 ? '+' : '') + t.units.toFixed(2) : '—', t.units >= 0 ? 'text-emerald' : 'text-rose')}
      </div>
      <div className="card overflow-x-auto p-4">
        <h2 className="mb-2 font-display font-bold">Pe tip de piață</h2>
        <table className="w-full text-sm"><thead className="text-left text-muted"><tr><th className="py-1">Piață</th><th>Selecții</th><th>Câștigate</th><th>Pierdute</th><th>Brier</th></tr></thead>
          <tbody>{m.map((r) => <tr key={r.market} className="border-t border-line"><td className="py-1.5">{r.market}</td><td className="tabular">{r.n}</td><td className="tabular">{r.won}</td><td className="tabular">{r.lost}</td><td className="tabular">{r.brier?.toFixed(3) ?? '—'}</td></tr>)}</tbody></table>
        {settled < 30 && <p className="mt-3 text-xs text-gold">Eșantion insuficient ({settled} bilete decise) pentru concluzii despre profitabilitate.</p>}
      </div>
      <div className="card overflow-x-auto p-4">
        <h2 className="mb-1 font-display font-bold">Agenții — limite și rezultate verificate</h2>
        <p className="mb-3 text-xs text-muted">Fiecare pronostic al fiecărui agent este verificat automat după meci, chiar dacă nu a intrat pe bilet. Agentul își primește propriul istoric în analizele următoare și își ajustează estimările. Un vot peste cota maximă sau sub probabilitatea minimă a agentului nu se numără.</p>
        <table className="w-full text-sm"><thead className="text-left text-muted"><tr><th className="py-1">Agent</th><th>Cotă max</th><th>Prob. min</th><th>Decise</th><th>Câștigate</th><th>Rată</th><th>Cotă medie</th><th>Estimare medie</th></tr></thead>
          <tbody>{VOTING_AGENTS.map((a) => { const r = records.get(a.id); return (
            <tr key={a.id} className="border-t border-line"><td className="py-1.5"><span style={{ color: a.accent }}>{a.name}</span> <span className="text-xs text-muted">{a.title}</span></td>
              <td className="tabular">{a.maxOdds.toFixed(2)}</td><td className="tabular">{Math.round(a.minProbability * 100)}%</td>
              <td className="tabular">{r?.decided ?? 0}</td><td className="tabular">{r?.won ?? 0}</td><td className="tabular">{r ? `${Math.round(r.hitRate * 100)}%` : '—'}</td>
              <td className="tabular">{r?.avgOdds ? r.avgOdds.toFixed(2) : '—'}</td><td className="tabular">{r?.avgEstimated != null ? `${Math.round(r.avgEstimated * 100)}%` : '—'}</td></tr>); })}</tbody></table>
      </div>
    </div>
  );
}
