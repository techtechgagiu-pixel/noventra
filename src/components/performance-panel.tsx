import { VOTING_AGENTS } from '@/lib/ai/agents';
import { allTrackRecords } from '@/lib/track-record';

export async function PerformancePanel() {
  const records = new Map((await allTrackRecords(VOTING_AGENTS.map((a) => a.id)).catch(() => [])).map((r) => [r.id, r.record]));
  return (
    <div className="space-y-5">
      <div className="card overflow-x-auto p-4">
        <h2 className="mb-1 font-display font-bold">Agenții — limite și rezultate verificate</h2>
        <p className="mb-3 text-xs text-muted">Toată comunitatea · de la început · ultima poziție pe meci și agent. Numai rezultate decise (verde/roșu), inclusiv pronosticurile care nu au intrat pe bilet. Aceleași reguli ca în Statistici → De la început.</p>
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
