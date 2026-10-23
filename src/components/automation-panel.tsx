'use client';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, fmtDateTime, AGENT_META } from '@/lib/format';
import { useVisibleRefresh } from '@/lib/use-visible-refresh';
import type { automationHealth } from '@/lib/automation';

type Health = Awaited<ReturnType<typeof automationHealth>>;
export function AutomationPanel({ initial }: { initial: Health }) {
  const [health, setHealth] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  const load = useCallback(async () => { setHealth(await api<Health>('/api/admin/automation')); }, []);
  useVisibleRefresh(load);
  const run = health.runs.find((x) => x.name === 'settlement');
  const sync = async () => {
    setBusy(true); setMessage('');
    try {
      const r = await api<{ result: { status: string; detail?: { predictionsChanged?: number; selectionsChanged?: number; ticketsChanged?: number } }; health: Health }>('/api/admin/automation', { method: 'POST' });
      setHealth(r.health); router.refresh();
      setMessage(r.result.status === 'completed' ? `Rezultatele au fost verificate. Actualizări: ${r.result.detail?.predictionsChanged ?? 0} pronosticuri, ${r.result.detail?.selectionsChanged ?? 0} selecții, ${r.result.detail?.ticketsChanged ?? 0} bilete.` : r.result.status === 'busy' ? 'O verificare rulează deja.' : 'Verificare incompletă; vezi detaliile și următoarea reîncercare.');
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };
  return <section aria-label="Actualizări automate" className="card space-y-3 p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Actualizări automate</h2><p className="text-xs text-muted">Ultima verificare reușită: {run?.last_success_at ? fmtDateTime(String(run.last_success_at)) : 'încă neconfirmată'} · interval 5 minute cât serverul este activ</p></div><button disabled={busy} onClick={() => void sync()} className="btn btn-ghost">{busy ? 'Verific rezultatele…' : 'Actualizează rezultatele'}</button></div>
    {message && <p role="status" className="text-cyan">{message}</p>}
    {run?.last_error && <p className="text-gold">{String(run.last_error)}</p>}
    <details><summary className="cursor-pointer text-xs text-cyan">Starea verificărilor și a agenților</summary><div className="mt-2 space-y-2 text-xs text-muted"><p>{health.note}</p><p>Rezultate finale care mai așteaptă date: {health.pending?.agent_picks_awaiting ?? 0} pronosticuri de agent, {health.pending?.ticket_legs_awaiting ?? 0} selecții de bilet. Meciuri cu status întârziat: {health.pending?.overdue_fixtures ?? 0}.</p><p>Analize active sau în pauză: {health.jobs.map((j) => `${j.status}: ${j.n}`).join(' · ') || 'niciuna'}. Pauzele cer reluare de către creator; nu consumă automat buget nou.</p>{health.agents.filter((a) => a.failed > 0).map((a) => <p key={String(a.agent_id)}>{AGENT_META[String(a.agent_id)]?.name ?? String(a.agent_id)}: {a.successful}/{a.calls} apeluri reușite{a.last_error ? ` · ${String(a.last_error).slice(0, 180)}` : ''}</p>)}</div></details>
  </section>;
}
