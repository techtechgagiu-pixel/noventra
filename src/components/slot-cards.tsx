'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Loader2, Sparkles } from 'lucide-react';
import { api, fmtDateTime, fmtDay, odds, STATUS_RO } from '@/lib/format';

type Slot = {
  slot: { id: string; title: string; subtitle: string; policy?: { minOdds: number; maxOdds: number; minLegs: number }; target: number; period: 'daily' | 'weekly'; requiredLegs: number | null; variant: string };
  periodKey: string; nextReset: string;
  job: null | { id: string; status: string; stage: string; createdAt: string; lastError: string | null };
  ticket: null | { id: string; generationStatus: string; actualOdds: number | null; legCount: number; createdAt: string; outcomeStatus: string };
  action: 'CREATE' | 'VIEW_ANALYSIS' | 'VIEW_TICKET' | 'VIEW_RESULT' | 'RESUME';
};
const LABEL = { CREATE: 'CREEAZĂ BILETUL', VIEW_ANALYSIS: 'VEZI ANALIZA', VIEW_TICKET: 'VEZI BILETUL', VIEW_RESULT: 'VEZI REZULTATUL', RESUME: 'CONTINUĂ ANALIZA' } as const;
const ACCENT: Record<string, string> = { FIVE_A: '#ffbe3d', FIVE_B: '#7fdc6c', TWO_A: '#8fd0ff', TWO_B: '#f472b6', WEEKLY_100: '#ffe36e' };

export function SlotCards({ initial }: { initial: Slot[] }) {
  const [slots, setSlots] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const refresh = useCallback(async () => { try { setSlots((await api<{ slots: Slot[] }>('/api/ticket-slots')).slots); } catch { /* keep last state */ } }, []);
  useEffect(() => {
    const active = slots.some((s) => s.job && !s.ticket);
    if (!active) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 10_000);
    return () => clearInterval(t);
  }, [slots, refresh]);

  async function act(s: Slot) {
    setError(null);
    if (s.action === 'VIEW_TICKET' || s.action === 'VIEW_RESULT') return router.push(`/?tab=bilete&ticket=${s.ticket!.id}`);
    if (s.action === 'VIEW_ANALYSIS') return router.push(`/?tab=analiza&job=${s.job!.id}`);
    setBusy(s.slot.id);
    try {
      if (s.action === 'RESUME') { await api(`/api/jobs/${s.job!.id}/resume`, { method: 'POST' }); router.push(`/?tab=analiza&job=${s.job!.id}`); return; }
      const r = await api<{ jobId: string }>(`/api/ticket-slots/${s.slot.id}/generate`, { method: 'POST' });
      router.push(`/?tab=analiza&job=${r.jobId}`);
    } catch (e) { setError((e as Error).message); setBusy(null); }
  }

  const daily = slots.filter((s) => s.slot.period === 'daily');
  const weekly = slots.find((s) => s.slot.period === 'weekly')!;
  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-xl border border-rose/40 bg-rose/10 p-4 text-sm text-rose">{error}</p>}
      <section aria-labelledby="daily">
        <div className="mb-3 flex items-baseline justify-between"><h2 id="daily" className="font-display text-xl font-bold">Biletele zilei</h2><span className="text-sm text-muted">{fmtDay(daily[0].periodKey)} · se resetează la miezul nopții</span></div>
        <div className="grid gap-4 sm:grid-cols-2">{daily.map((s) => <Card key={s.slot.id} s={s} busy={busy === s.slot.id} onAct={() => act(s)} />)}</div>
      </section>
      <section aria-labelledby="weekly">
        <h2 id="weekly" className="mb-3 font-display text-xl font-bold">Biletul săptămânii</h2>
        <Card s={weekly} busy={busy === weekly.slot.id} onAct={() => act(weekly)} wide />
      </section>
    </div>
  );
}

function Card({ s, busy, onAct, wide }: { s: Slot; busy: boolean; onAct: () => void; wide?: boolean }) {
  const accent = ACCENT[s.slot.id];
  const state = s.ticket ? (s.ticket.generationStatus === 'COMPLETED' ? 'Bilet creat' : s.ticket.generationStatus === 'NO_BET' ? 'NO BET — nimic suficient de bun' : 'Incomplet') : s.job ? STATUS_RO[s.job.status] ?? s.job.status : 'Disponibil';
  const running = s.job && !s.ticket && s.job.status !== 'PAUSED' && s.job.status !== 'FAILED';
  return (
    <article className={`card relative overflow-hidden p-6 ${wide ? 'md:p-8' : ''}`} style={{ boxShadow: `inset 0 1px 0 ${accent}33` }}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full blur-3xl" style={{ background: `${accent}22` }} aria-hidden />
      <div className={`flex flex-col gap-5 ${wide ? 'md:flex-row md:items-center md:justify-between' : ''}`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em]" style={{ color: accent }}>{s.slot.period === 'weekly' ? 'O dată pe săptămână' : `Bilet ${s.slot.variant} · zilnic`}</p>
          <h3 className="mt-1 font-display text-lg font-bold">{s.slot.title}</h3>
          <div className="mt-2 flex items-end gap-3">
            <span className="font-display text-6xl font-bold leading-none tabular" style={{ color: accent }}>{s.slot.target}</span>
            <span className="pb-1 text-sm text-muted">cotă țintă{s.slot.requiredLegs ? ` · exact ${s.slot.requiredLegs} meciuri` : s.slot.policy ? ` · min. ${s.slot.policy.minLegs} meciuri, cote ${s.slot.policy.minOdds.toFixed(2)}–${s.slot.policy.maxOdds.toFixed(2)}` : ' · meciuri alese automat'}</span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted">Stare</dt><dd className="font-medium">{running && <Loader2 size={13} className="mr-1 inline animate-spin" aria-hidden />}{state}</dd>
            {s.ticket?.actualOdds != null && <><dt className="text-muted">Cotă reală</dt><dd className="font-semibold tabular">{odds(s.ticket.actualOdds)}</dd></>}
            {s.ticket && s.ticket.legCount > 0 && <><dt className="text-muted">Meciuri</dt><dd className="tabular">{s.ticket.legCount}</dd></>}
            {(s.ticket || s.job) && <><dt className="text-muted">Creat</dt><dd>{fmtDateTime(s.ticket?.createdAt ?? s.job!.createdAt)}</dd></>}
            {!s.job && <><dt className="text-muted">Disponibil</dt><dd>{s.slot.period === 'weekly' ? 'până luni, 00:00' : 'azi, o singură dată'}</dd></>}
          </dl>
          {s.job?.status === 'PAUSED' && s.job.lastError && <p className="mt-3 text-xs text-gold">{s.job.lastError}</p>}
        </div>
        <button onClick={onAct} disabled={busy} className={`btn ${s.action === 'CREATE' ? (s.slot.period === 'weekly' ? 'btn-gold' : 'btn-primary') : 'btn-ghost'} w-full px-6 py-4 text-base ${wide ? 'md:w-72' : ''}`}>
          {busy ? <Loader2 className="animate-spin" size={18} aria-hidden /> : s.action === 'CREATE' ? <Sparkles size={18} aria-hidden /> : null}
          {LABEL[s.action]}
        </button>
      </div>
      {s.ticket && <p className="mt-4 flex items-center gap-1 text-xs text-muted"><CalendarClock size={13} aria-hidden /> Următorul bilet: {s.slot.period === 'weekly' ? `luni, ${fmtDay(s.nextReset)}` : 'mâine'}</p>}
    </article>
  );
}
