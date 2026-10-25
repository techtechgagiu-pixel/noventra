'use client';
import { NEW_AI_PROFILES } from '@/lib/ai/new-agent-profiles';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Minus, Plus, Sparkles, Trophy } from 'lucide-react';
import { AGENT_META, api } from '@/lib/format';
import { CUSTOM_LIMIT_PER_DAY, customPolicy, customThreshold } from '@/lib/slots';
import { LeaguePicker, type LeagueOption } from '@/components/matches/league-picker';
import type { MatchRow } from '@/lib/catalog';

export type AgentCard = { id: string; name: string; title: string; specialty: string; risk: number; maxOdds: number; minProbability: number; model: string | null; record: string | null };
const TARGETS = [2, 3, 5, 10, 20, 50, 100];
const pick = (...ids: string[]) => (a: AgentCard[]) => a.filter((x) => ids.includes(x.id)).map((x) => x.id);
/** Ready-made teams: by risk profile, by story (generations, roles) and by method. The user can still tick freely. */
const GROUPS: Array<{ label: string; hint: string; ids: (a: AgentCard[]) => string[] }> = [
  { label: 'Noua echipă AI (10)', hint: 'Cele zece modele noi, fiecare cu un rol distinct', ids: pick(...NEW_AI_PROFILES.map((a) => a.id)) },
  { label: 'Toți', hint: 'Toată echipa, toate opiniile', ids: (a) => a.map((x) => x.id) },
  { label: 'Prudenții', hint: 'Cote mici, probabilitate mare', ids: (a) => a.filter((x) => x.maxOdds <= 1.7).map((x) => x.id) },
  { label: 'Echilibrații', hint: 'Cote medii, risc moderat', ids: (a) => a.filter((x) => x.maxOdds > 1.7 && x.maxOdds < 2).map((x) => x.id) },
  { label: 'Vânătorii de cote', hint: 'Acceptă cote mari', ids: (a) => a.filter((x) => x.maxOdds >= 2).map((x) => x.id) },
  { label: 'Context și tactică (6)', hint: 'Context, tactică și verificarea pieței', ids: pick('andrei', 'mihai', 'ilie', 'prunea', 'petrescu', 'cosmin') },
  { label: 'Tacticienii', hint: 'Scenarii și ritmul jocului', ids: pick('robert', 'radu', 'cosmin', 'ioana', 'petrescu', 'sumudica', 'alex') },
  { label: 'Strategie și audit', hint: 'Strategie, scepticism și verificarea dovezilor', ids: pick('victor', 'elena', 'becali', 'stoica', 'porumboiu') },
  { label: 'Dinamica jocului', hint: 'Ocazii, dueluri și scenarii adverse', ids: pick('ianis', 'dragusin', 'man', 'diana', 'tamas') },
  { label: 'Apărarea', hint: 'Gândesc din spate: goluri primite, portari, dueluri', ids: pick('dragusin', 'prunea', 'petrescu', 'tamas', 'diana', 'mihai') },
  { label: 'Atacul', hint: 'Goluri, ocazii, flancuri', ids: pick('alex', 'man', 'ianis', 'andrei', 'ioana', 'sumudica') },
  { label: 'Oamenii cifrelor', hint: 'Statistică, piață, risc, verificare', ids: pick('andrei', 'elena', 'cosmin', 'robert', 'porumboiu', 'stoica') },
  { label: 'Contrarianii', hint: 'Caută ce scapă majorității', ids: pick('stoica', 'sumudica', 'tamas', 'becali', 'hantu') },
  { label: 'Echipă mică (5)', hint: 'Rapid și ieftin: un profil din fiecare zonă', ids: pick('robert', 'andrei', 'ioana', 'cosmin', 'radu') },
  { label: 'Surpriză (7)', hint: '7 agenți la întâmplare', ids: (a) => [...a].sort(() => Math.random() - 0.5).slice(0, 7).map((x) => x.id) },
];

/** Selectable offsets, from 30 minutes to one week. */
const STOPS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 30, 36, 42, 48, 60, 72, 84, 96, 120, 144, 168];
const dur = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : h < 24 ? `${h} h` : h % 24 === 0 ? `${h / 24} ${h === 24 ? 'zi' : 'zile'}` : `${Math.floor(h / 24)} ${h < 48 ? 'zi' : 'zile'} și ${h % 24} h`);
const at = (h: number) => new Date(Date.now() + h * 3600_000).toLocaleString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' });
const span = (a: number, b: number) => `${at(a)} – ${at(b)}`;

export function CustomForm({ agents, topAgentIds = [], remaining = CUSTOM_LIMIT_PER_DAY }: { agents: AgentCard[]; topAgentIds?: string[]; remaining?: number }) {
  const router = useRouter();
  const [count, setCount] = useState(1);
  const inFlight = useRef(false);
  const attempt = useRef<{ body: string; requestId: string } | null>(null);
  const [target, setTarget] = useState(5);
  const [legs, setLegs] = useState(4);
  const [fromI, setFromI] = useState(STOPS.indexOf(2));
  const [toI, setToI] = useState(STOPS.indexOf(48));
  const fromHours = STOPS[fromI], toHours = STOPS[toI];
  const win = toHours > 48 ? '7d' : toHours > 24 ? '48h' : '24h';
  const [chosen, setChosen] = useState<string[]>(['victor', 'andrei', 'alex', 'robert', 'ioana']);
  const [leagues, setLeagues] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<{ rows: MatchRow[]; leagues: LeagueOption[] } | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  // The full fixture catalogue is only needed when the user opens league/interval options.
  useEffect(() => {
    if (!optionsOpen || catalog) return;
    const controller = new AbortController();
    setCatalogError(false);
    api<{ rows: MatchRow[]; leagues: LeagueOption[] }>('/api/matches', { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setCatalog(data); })
      .catch(() => { if (!controller.signal.aborted) setCatalogError(true); });
    return () => controller.abort();
  }, [optionsOpen, catalog, catalogAttempt]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perLeg = Math.pow(target, 1 / legs);
  const policy = useMemo(() => customPolicy({ target, legs, agents: chosen, window: win, fromHours, toHours }), [target, legs, chosen, win, fromHours, toHours]);
  const tooLow = perLeg < 1.1; const tooHigh = perLeg > 3.2;
  const risk = perLeg <= 1.3 ? { t: 'prudent', c: 'text-emerald' } : perLeg <= 1.6 ? { t: 'echilibrat', c: 'text-cyan' } : perLeg <= 2.1 ? { t: 'curajos', c: 'text-gold' } : { t: 'riscant', c: 'text-rose' };
  // Fixtures with odds that start inside the chosen interval, per league (what the analysis can actually use).
  const inWindow = useMemo(() => {
    const now = Date.now();
    return (catalog?.rows ?? []).filter((m) => m.odds && m.status === 'pre' && Date.parse(m.kickoff) >= now + fromHours * 3600_000 && Date.parse(m.kickoff) <= now + toHours * 3600_000);
  }, [catalog, fromHours, toHours]);
  const leagueOptions = useMemo(() => (catalog?.leagues ?? []).map((l) => ({ ...l, count: inWindow.filter((m) => m.leagueId === l.id).length })), [catalog, inWindow]);
  const available = leagues.length ? inWindow.filter((m) => leagues.includes(m.leagueId)).length : inWindow.length;
  const fits = (a: AgentCard) => Math.min(a.maxOdds + (policy.agentCapBonus ?? 0), policy.maxOdds) >= perLeg * 0.92;
  const topSix = topAgentIds.filter((id) => agents.some((a) => a.id === id));
  const topSixReady = topSix.length === 6;
  const topSixActive = topSixReady && chosen.length === 6 && topSix.every((id) => chosen.includes(id));
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  async function create() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null);
    const body = JSON.stringify({ target, legs, agents: chosen, fromHours, toHours, leagues, count });
    if (attempt.current?.body !== body) attempt.current = { body, requestId: crypto.randomUUID() };
    try {
      const r = await api<{ jobId: string }>('/api/custom-tickets', { method: 'POST', body: JSON.stringify({ ...JSON.parse(body), requestId: attempt.current.requestId }) });
      router.push(`/?tab=custom&job=${r.jobId}`);
    } catch (e) { setError((e as Error).message); setBusy(false); inFlight.current = false; }
  }

  return (
    <div className="space-y-6">
      <div className="custom-basics">
        <div className="card p-4">
          <label htmlFor="target" className="text-xs font-semibold text-muted">Cota dorită</label>
          <input id="target" type="number" inputMode="decimal" min={1.2} max={1000} step={0.1} value={target} onChange={(e) => setTarget(Number(e.target.value) || 0)}
            className="mt-2 w-full rounded-xl border border-line bg-ink px-3 py-2.5 font-display text-2xl font-bold tabular text-text outline-none focus:border-cyan" />
          <div className="mt-2 flex flex-wrap gap-1.5">{TARGETS.map((t) => <button key={t} onClick={() => setTarget(t)} className={`chip ${target === t ? 'text-cyan' : 'text-muted'}`}>{t}</button>)}</div>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-muted">Din câte meciuri</p>
          <div className="mt-2 flex items-center gap-2">
            <button aria-label="Mai puține meciuri" onClick={() => setLegs((l) => Math.max(1, l - 1))} className="btn btn-ghost h-11 w-11"><Minus size={16} /></button>
            <output className="flex-1 text-center font-display text-3xl font-bold tabular" aria-live="polite">{legs}</output>
            <button aria-label="Mai multe meciuri" onClick={() => setLegs((l) => Math.min(15, l + 1))} className="btn btn-ghost h-11 w-11"><Plus size={16} /></button>
          </div>
          <p className="mt-2 text-xs text-muted">Biletul va avea exact {legs} {legs === 1 ? 'meci' : 'meciuri'}.</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-muted">Media de cotă pe meci</p>
          <p className={`mt-2 font-display text-3xl font-bold tabular ${tooLow || tooHigh ? 'text-rose' : risk.c}`}>≈ {Number.isFinite(perLeg) ? perLeg.toFixed(2) : '—'}</p>
          <p className="mt-1 text-xs text-muted">{tooLow ? 'Prea mică — pune mai puține meciuri.' : tooHigh ? 'Prea mare — pune mai multe meciuri.' : <>Pentru cota {target} din {legs} {legs === 1 ? 'meci' : 'meciuri'}. Cotele selecțiilor pot diferi.</>}</p>

        </div>
      </div>

      <details className="custom-options" onToggle={(e) => setOptionsOpen(e.currentTarget.open)}>
        <summary><span>Interval și ligi</span><span>Peste {dur(fromHours)}–{dur(toHours)} · {leagues.length ? `${leagues.length} ligi` : 'toate ligile'}</span></summary>
        <div className="custom-options-body">
          <fieldset className="mt-3 space-y-2" aria-label="Intervalul meciurilor">
            <legend className="text-xs text-muted">Meciuri care încep între <strong className="text-text">peste {dur(fromHours)}</strong> și <strong className="text-text">peste {dur(toHours)}</strong></legend>
            <label className="block text-[11px] text-muted">De la
              <input type="range" min={0} max={STOPS.length - 2} value={fromI} onChange={(e) => { const v = Number(e.target.value); setFromI(v); if (toI <= v) setToI(v + 1); }} className="mt-1 w-full accent-cyan" aria-valuetext={`peste ${dur(fromHours)}`} />
            </label>
            <label className="block text-[11px] text-muted">Până la
              <input type="range" min={1} max={STOPS.length - 1} value={toI} onChange={(e) => { const v = Number(e.target.value); setToI(v); if (fromI >= v) setFromI(v - 1); }} className="mt-1 w-full accent-cyan" aria-valuetext={`peste ${dur(toHours)}`} />
            </label>
            <p className="text-[11px] text-muted tabular" suppressHydrationWarning>{span(fromHours, toHours)}</p>
          </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-bold">Din ce ligi</h3>
          <p className="text-xs text-muted">Bifează ligile din care să-ți facă biletul. Nimic bifat = toate ligile.</p>
        </div>
        <div className="mt-3">
          {catalog ? <LeaguePicker leagues={leagueOptions} value={leagues} onChange={setLeagues} allLabel="Toate ligile" />
            : catalogError ? <p role="status" className="text-sm text-gold">Ligile nu s-au încărcat. Setarea rămâne „Toate ligile”. <button type="button" className="underline" onClick={() => setCatalogAttempt((n) => n + 1)}>Reîncearcă</button></p>
            : <p className="rounded-xl border border-line bg-ink px-3 py-2.5 text-sm text-muted">Încarc ligile disponibile…</p>}
        </div>
        {catalog && <p className={`mt-2 text-xs ${available < legs * 2 ? 'text-gold' : 'text-muted'}`}>
          {available} {available === 1 ? 'meci cu cote' : 'meciuri cu cote'} în intervalul ales{leagues.length ? ` din ${leagues.length} ${leagues.length === 1 ? 'ligă' : 'ligi'}` : ''}.
          {available < legs * 2 && ' Puține pentru un bilet de ' + legs + ' meciuri: echipa poate refuza multe — adaugă ligi sau lărgește intervalul.'}
        </p>}
        </div>
      </details>

      <details className="custom-options">
        <summary><span>Echipa de agenți</span><span className="custom-team-peek" aria-hidden="true">{chosen.slice(0, 5).map((id) => <img key={id} src={AGENT_META[id]?.img} alt="" width={24} height={24} />)}</span><span>{chosen.length} {chosen.length === 1 ? 'agent ales' : 'agenți aleși'} · schimbă echipa</span></summary>
        <div className="custom-options-body">
          <div className="mb-4 flex flex-wrap gap-3" aria-label="Echipa selectată">{chosen.flatMap((id) => agents.filter((a) => a.id === id)).map((a) => <div key={a.id} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5"><img src={AGENT_META[a.id]?.img} alt="" className="h-8 w-8 rounded-full object-cover" /><div><p className="text-xs font-semibold">{a.name}</p><p className="text-[10px] text-muted">{a.model ?? 'Model AI'}</p></div></div>)}</div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-bold">Alege agenții din teren</h3>
          <span className="text-sm text-muted">{chosen.length} {chosen.length === 1 ? 'ales' : 'aleși'}</span>
          <button onClick={() => setChosen([])} className="ml-auto chip text-muted hover:text-text">Golește</button>
        </div>
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible" role="group" aria-label="Echipe gata făcute">
          <button type="button" aria-pressed={topSixActive} disabled={!topSixReady || busy} onClick={() => setChosen(topSix)}
            title="Primii șase agenți din Statistici · luna curentă · toată comunitatea"
            className={`chip shrink-0 disabled:opacity-50 ${topSixActive ? 'border-gold text-gold' : 'text-gold hover:text-text'}`}>
            <Trophy size={13} aria-hidden /> Top 6
          </button>
          {GROUPS.map((g) => {
            const ids = g.label.startsWith('Surpriză') ? null : g.ids(agents);
            const active = !!ids && ids.length === chosen.length && ids.every((id) => chosen.includes(id));
            return (
              <button key={g.label} title={g.hint} aria-pressed={active} onClick={() => setChosen(ids ?? g.ids(agents))}
                className={`chip shrink-0 ${active ? 'border-cyan text-cyan' : 'text-muted hover:text-text'}`}>
                {g.label}{ids && <span aria-hidden className="ml-1 tabular opacity-60">{ids.length}</span>}
              </button>
            );
          })}
        </div>
        <p className="mb-3 text-xs text-muted">{topSixReady ? 'Top 6 selectează primii șase agenți din Statistici: luna curentă, toată comunitatea. Se actualizează odată cu rezultatele; poți modifica echipa după selectare.' : 'Top 6 devine disponibil când cel puțin șase agenți au rezultate decise în luna curentă.'}</p>
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
                  {a.model && <p className="mt-1 truncate text-[10px] text-cyan" title={a.model}>{a.model}</p>}
                  {on && !fits(a) && !tooHigh && <p className="mt-1 text-[11px] text-gold">Cota pe meci e peste caracterul lui — va refuza des.</p>}
                </div>
                <span className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border ${on ? 'border-transparent bg-cyan text-ink' : 'border-line'}`}>{on && <Check size={12} strokeWidth={3} />}</span>
              </button>
            );
          })}
        </div>
        </div>
      </details>
      <section className="card p-4" aria-labelledby="ticket-count-label">
        <label id="ticket-count-label" htmlFor="ticket-count" className="font-display text-lg font-bold">Câte bilete să creeze echipa?</label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input id="ticket-count" type="number" inputMode="numeric" min={1} max={Math.max(1, remaining)} step={1} value={count} disabled={busy || remaining === 0}
            onChange={(e) => setCount(Math.max(1, Math.min(Math.max(1, remaining), Math.trunc(Number(e.target.value) || 1))))}
            className="w-24 rounded-xl border border-line bg-ink px-3 py-2 text-xl font-bold tabular outline-none focus:border-cyan" />
          <p className="text-sm text-muted" role="status">Mai ai <strong className="text-cyan">{remaining}</strong> din {CUSTOM_LIMIT_PER_DAY} bilete custom azi.</p>
        </div>
        <p className="mt-2 text-xs text-muted">Aceeași cotă țintă, aceleași ligi și aceeași echipă pentru fiecare bilet. Fiecare are propria analiză și consumă un loc din limita zilnică. Meciurile se pot repeta între bilete.</p>
      </section>
      <div className="custom-submit">
        <p className="text-sm text-muted md:flex-1">
          {count} {count === 1 ? 'bilet' : 'bilete'} · fiecare cu cotă <strong className="text-text">{target}</strong> din <strong className="text-text">{legs}</strong> {legs === 1 ? 'meci' : 'meciuri'} · {chosen.length} agenți · {leagues.length ? `${leagues.length} ${leagues.length === 1 ? 'ligă' : 'ligi'}` : 'toate ligile'} · minimum <strong className="text-text">{customThreshold(chosen.length)}</strong> voturi pentru o selecție. GPT-6 Luna Pro dă verdictul final.
        </p>
        {!chosen.length && <p className="text-sm text-gold">Alege cel puțin un agent din „Echipa de agenți”.</p>}
        {error && <p className="text-sm text-rose" role="alert">{error}</p>}
        <button onClick={create} disabled={busy || remaining === 0 || count < 1 || count > remaining || !chosen.length || tooLow || tooHigh || target < 1.2 || (!!catalog && leagues.length > 0 && available === 0)} className="btn btn-primary px-6 py-3 disabled:opacity-50"><Sparkles size={16} aria-hidden /> {busy ? 'Pornesc…' : count === 1 ? 'Pornește dezbaterea' : `Creează ${count} bilete`}</button>
      </div>
      <p className="text-xs leading-relaxed text-muted">După pornire vezi agenții pe hartă și argumentele în chat. Cota este o țintă; echipa poate refuza meciuri și poate încheia fără un bilet complet.</p>
    </div>
  );
}
