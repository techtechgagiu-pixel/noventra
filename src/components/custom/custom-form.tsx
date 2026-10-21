'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Minus, Plus, Sparkles } from 'lucide-react';
import { AGENT_META, api } from '@/lib/format';
import { customPolicy, customThreshold } from '@/lib/slots';

export type AgentCard = { id: string; name: string; title: string; specialty: string; risk: number; maxOdds: number; minProbability: number; model: string | null; record: string | null };
const TARGETS = [2, 3, 5, 10, 20, 50, 100];
const GROUPS: Array<{ label: string; ids: (a: AgentCard[]) => string[] }> = [
  { label: 'Toți', ids: (a) => a.map((x) => x.id) },
  { label: 'Prudenții', ids: (a) => a.filter((x) => x.maxOdds <= 1.75).map((x) => x.id) },
  { label: 'Vânătorii de cote', ids: (a) => a.filter((x) => x.maxOdds >= 1.85).map((x) => x.id) },
];

export function CustomForm({ agents }: { agents: AgentCard[] }) {
  const router = useRouter();
  const [target, setTarget] = useState(5);
  const [legs, setLegs] = useState(4);
  const [win, setWin] = useState<'48h' | '7d'>('48h');
  const [chosen, setChosen] = useState<string[]>(['victor', 'andrei', 'alex', 'robert', 'ioana']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perLeg = Math.pow(target, 1 / legs);
  const policy = useMemo(() => customPolicy({ target, legs, agents: chosen, window: win }), [target, legs, chosen, win]);
  const tooLow = perLeg < 1.1; const tooHigh = perLeg > 3.2;
  const risk = perLeg <= 1.3 ? { t: 'prudent', c: 'text-emerald' } : perLeg <= 1.6 ? { t: 'echilibrat', c: 'text-cyan' } : perLeg <= 2.1 ? { t: 'curajos', c: 'text-gold' } : { t: 'riscant', c: 'text-rose' };
  const fits = (a: AgentCard) => Math.min(a.maxOdds + (policy.agentCapBonus ?? 0), policy.maxOdds) >= perLeg * 0.92;
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  async function create() {
    setBusy(true); setError(null);
    try {
      const r = await api<{ jobId: string }>('/api/custom-tickets', { method: 'POST', body: JSON.stringify({ target, legs, agents: chosen, window: win }) });
      router.push(`/?tab=custom&job=${r.jobId}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <label htmlFor="target" className="text-xs font-semibold uppercase tracking-wider text-muted">Cota dorită</label>
          <input id="target" type="number" inputMode="decimal" min={1.2} max={1000} step={0.1} value={target} onChange={(e) => setTarget(Number(e.target.value) || 0)}
            className="mt-2 w-full rounded-xl border border-line bg-ink px-3 py-2.5 font-display text-2xl font-bold tabular text-text outline-none focus:border-cyan" />
          <div className="mt-2 flex flex-wrap gap-1.5">{TARGETS.map((t) => <button key={t} onClick={() => setTarget(t)} className={`chip ${target === t ? 'text-cyan' : 'text-muted'}`}>{t}</button>)}</div>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Din câte meciuri</p>
          <div className="mt-2 flex items-center gap-2">
            <button aria-label="Mai puține meciuri" onClick={() => setLegs((l) => Math.max(1, l - 1))} className="btn btn-ghost h-11 w-11"><Minus size={16} /></button>
            <output className="flex-1 text-center font-display text-3xl font-bold tabular" aria-live="polite">{legs}</output>
            <button aria-label="Mai multe meciuri" onClick={() => setLegs((l) => Math.min(15, l + 1))} className="btn btn-ghost h-11 w-11"><Plus size={16} /></button>
          </div>
          <p className="mt-2 text-xs text-muted">Biletul va avea exact {legs} {legs === 1 ? 'meci' : 'meciuri'}.</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Cotă necesară pe meci</p>
          <p className={`mt-2 font-display text-3xl font-bold tabular ${tooLow || tooHigh ? 'text-rose' : risk.c}`}>≈ {Number.isFinite(perLeg) ? perLeg.toFixed(2) : '—'}</p>
          <p className="mt-1 text-xs text-muted">{tooLow ? 'Prea mică — pune mai puține meciuri.' : tooHigh ? 'Prea mare — pune mai multe meciuri.' : <>Profil <strong className={risk.c}>{risk.t}</strong> · cote acceptate {policy.minOdds.toFixed(2)}–{policy.maxOdds.toFixed(2)}, prob. ≥ {Math.round(policy.minProbability * 100)}%</>}</p>
          <div className="mt-3 flex gap-1.5" role="group" aria-label="Fereastra meciurilor">
            {(['48h', '7d'] as const).map((w) => <button key={w} onClick={() => setWin(w)} aria-pressed={win === w} className={`chip ${win === w ? 'text-cyan' : 'text-muted'}`}>{w === '48h' ? 'Meciuri în 2–48 h' : 'Următoarele 7 zile'}</button>)}
          </div>
        </div>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-bold">Alege agenții din teren</h3>
          <span className="text-sm text-muted">{chosen.length} {chosen.length === 1 ? 'ales' : 'aleși'}</span>
          <div className="ml-auto flex flex-wrap gap-1.5">{GROUPS.map((g) => <button key={g.label} onClick={() => setChosen(g.ids(agents))} className="chip text-muted hover:text-text">{g.label}</button>)}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => {
            const on = chosen.includes(a.id); const meta = AGENT_META[a.id]; const [role, bio] = a.title.split(' · ');
            return (
              <button key={a.id} onClick={() => toggle(a.id)} aria-pressed={on}
                className={`card relative flex gap-3 p-3 text-left transition ${on ? '' : 'opacity-55 hover:opacity-90'}`} style={on ? { borderColor: `${meta?.accent}aa`, boxShadow: `0 0 0 1px ${meta?.accent}55, 0 8px 30px ${meta?.accent}1f` } : undefined}>
                <img src={meta?.img} alt="" className="h-16 w-16 shrink-0 rounded-2xl border-2 object-cover" style={{ borderColor: meta?.accent }} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-tight" style={{ color: meta?.accent }}>{a.name}</p>
                  <p className="text-xs font-semibold text-text">{role}</p>
                  {bio && <p className="text-[11px] text-muted">{bio}</p>}
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{a.specialty}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" title={`Risc ${a.risk}/100`}><div className="h-full rounded-full" style={{ width: `${a.risk}%`, background: meta?.accent }} /></div>
                    <span className="text-[10px] tabular text-muted">risc {a.risk}</span>
                  </div>
                  <p className="mt-1 text-[11px] tabular text-muted">max {a.maxOdds.toFixed(2)} · prob ≥ {Math.round(a.minProbability * 100)}%{a.record ? ` · ${a.record}` : ''}</p>
                  {on && !fits(a) && !tooHigh && <p className="mt-1 text-[11px] text-gold">Cota pe meci e peste caracterul lui — va refuza des.</p>}
                </div>
                <span className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border ${on ? 'border-transparent bg-cyan text-ink' : 'border-line'}`}>{on && <Check size={12} strokeWidth={3} />}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="card sticky bottom-3 z-10 flex flex-col gap-3 p-4 shadow-2xl backdrop-blur md:flex-row md:items-center" style={{ background: 'rgba(10,18,40,0.97)' }}>
        <p className="text-sm text-muted md:flex-1">
          Cotă <strong className="text-text">{target}</strong> din <strong className="text-text">{legs}</strong> {legs === 1 ? 'meci' : 'meciuri'} · {chosen.length} agenți · intră pe bilet o selecție susținută de minimum <strong className="text-text">{chosen.length >= agents.length ? 3 : customThreshold(chosen.length)}</strong> dintre ei. Fără „sub”. Creierul (M. Lucescu) alege pronosticul final.
        </p>
        {error && <p className="text-sm text-rose" role="alert">{error}</p>}
        <button onClick={create} disabled={busy || !chosen.length || tooLow || tooHigh || target < 1.2} className="btn btn-primary px-6 py-3 disabled:opacity-50"><Sparkles size={16} aria-hidden /> {busy ? 'Pornesc…' : 'CREEAZĂ BILETUL CUSTOM'}</button>
      </div>
    </div>
  );
}
