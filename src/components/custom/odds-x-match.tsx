'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/format';
import { MAX_CUSTOM_AGENTS } from '@/lib/slots';
import type { MatchRow } from '@/lib/catalog';
import type { AgentCard } from '@/components/custom/custom-form';

/** Owner request 10.11: you pick the matches (or a whole championship), set the price; the agents choose the pick for each match. */
const MIN_FROM_HOURS = 20 / 60;
const MAX_MATCHES = 20;
const REFRESH_MS = 60_000;
const TARGETS = [3, 5, 10, 20, 50, 100, 500, 1000];
const when = (iso: string) => new Date(iso).toLocaleString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' });

export function OddsXMatch({ agents, topAgentIds = [], remaining, limit, credits = null }: { agents: AgentCard[]; topAgentIds?: string[]; remaining: number; limit: number; credits?: number | null }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const attempt = useRef<{ body: string; requestId: string } | null>(null);
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [target, setTarget] = useState(10);
  const [picked, setPicked] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>(() => { const top = topAgentIds.filter((id) => agents.some((a) => a.id === id)); return top.length >= 3 ? top.slice(0, MAX_CUSTOM_AGENTS) : ['victor', 'andrei', 'alex', 'robert', 'ioana'].filter((id) => agents.some((a) => a.id === id)); });
  const [bold, setBold] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string[]>([]);
  const [updated, setUpdated] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always fresh: reload when opened, every minute while the tab is visible, and when the user comes back to it.
  useEffect(() => {
    let c = new AbortController();
    const load = (first: boolean) => {
      c.abort(); c = new AbortController(); const mine = c;
      if (first) setLoadError(false);
      api<{ rows: MatchRow[] }>('/api/matches', { signal: mine.signal }).then((d) => { if (!mine.signal.aborted) { setRows(d.rows); setLoadError(false); setUpdated(Date.now()); } }).catch(() => { if (!mine.signal.aborted && first) setLoadError(true); });
    };
    load(true);
    const tick = setInterval(() => { if (document.visibilityState === 'visible') load(false); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(false); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { c.abort(); clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); };
  }, [retry]);

  // Only football matches the analysis can use: not started, with prices, starting in 20 minutes … 7 days.
  const usable = useMemo(() => {
    const now = Date.now();
    return (rows ?? []).filter((m) => m.odds && m.status === 'pre' && m.source !== 'pandascore' && m.leagueId !== 'CS2' && Date.parse(m.kickoff) >= now + MIN_FROM_HOURS * 3600_000 && Date.parse(m.kickoff) <= now + 168 * 3600_000)
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  }, [rows]);
  useEffect(() => {
    if (!rows) return;
    const ok = new Set(usable.map((m) => m.id));
    setPicked((c) => (c.every((id) => ok.has(id)) ? c : c.filter((id) => ok.has(id))));
  }, [rows, usable]);
  const q = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const by = new Map<string, { id: string; league: string; country: string; items: MatchRow[] }>();
    for (const m of usable) {
      if (q && !`${m.home} ${m.away} ${m.league} ${m.country}`.toLowerCase().includes(q)) continue;
      const g = by.get(m.leagueId) ?? { id: m.leagueId, league: m.league, country: m.country, items: [] };
      g.items.push(m); by.set(m.leagueId, g);
    }
    return [...by.values()].sort((a, b) => b.items.length - a.items.length || a.league.localeCompare(b.league));
  }, [usable, q]);

  const toggleOpen = (id: string) => setOpen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const sel = useMemo(() => new Set(picked), [picked]);
  const toggle = (id: string) => setPicked((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= MAX_MATCHES ? c : [...c, id]));
  const toggleLeague = (ids: string[]) => setPicked((c) => {
    if (ids.every((id) => c.includes(id))) return c.filter((x) => !ids.includes(x));
    return [...c, ...ids.filter((id) => !c.includes(id))].slice(0, MAX_MATCHES);
  });
  const toggleAgent = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= MAX_CUSTOM_AGENTS ? c : [...c, id]));

  const n = picked.length;
  const perLeg = n ? Math.pow(target, 1 / n) : 0;
  const tooLow = n > 0 && perLeg < 1.1, tooHigh = n > 0 && perLeg > 3.2;
  const ready = n >= 1 && !tooLow && !tooHigh && chosen.length >= 1 && remaining > 0 && !busy;

  async function create() {
    if (inFlight.current || !ready) return;
    inFlight.current = true; setBusy(true); setError(null);
    const body = JSON.stringify({ target, fixtures: picked, agents: chosen, fromHours: MIN_FROM_HOURS, toHours: 168, count: 1, ...(bold ? { bold: true } : {}) });
    if (attempt.current?.body !== body) attempt.current = { body, requestId: crypto.randomUUID() };
    try {
      const r = await api<{ jobId: string }>('/api/custom-tickets', { method: 'POST', body: JSON.stringify({ ...JSON.parse(body), requestId: attempt.current.requestId }) });
      router.push(`/?tab=custom&job=${r.jobId}`);
    } catch (e) { setError((e as Error).message); setBusy(false); inFlight.current = false; }
  }

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <label htmlFor="oxm-target" className="text-xs font-semibold text-muted">Cota dorită pe bilet</label>
        <input id="oxm-target" type="number" inputMode="decimal" min={1.2} max={1000} step={0.1} value={target} onChange={(e) => setTarget(Number(e.target.value) || 0)}
          className="board-num mt-2 w-full rounded-lg border border-line bg-ink px-3 py-1.5 text-[2.6rem] outline-none focus:border-cyan" />
        <div className="mt-2 flex flex-wrap gap-1.5">{TARGETS.map((t) => <button key={t} type="button" onClick={() => setTarget(t)} className={`chip ${target === t ? 'text-cyan' : 'text-muted'}`}>{t}</button>)}</div>
        <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-line pt-3 text-sm">
          <input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan" />
          <span><span className="font-semibold">Riscă și cote mari</span><span className="mt-0.5 block text-[11px] text-muted">Agenții pot alege selecții cu cote mai mari și probabilitate mai mică. Util când cota dorită cere cote mari pe fiecare meci.</span></span>
        </label>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-lg font-bold">Alege meciurile</h2>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Caută echipă sau campionat" aria-label="Caută echipă sau campionat" className="ml-auto w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-cyan sm:w-64" />
        </div>
        <p className="mt-1 text-[11px] text-muted">Deschide un campionat ca să vezi meciurile, sau bifează-l întreg (maximum {MAX_MATCHES}). La meciurile „fără istoric” agenții decid din cote și știri. Lista se actualizează singură la fiecare minut{updated ? <> · ultima actualizare {new Date(updated).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Bucharest' })}</> : null}. Agenții aleg pronosticul de la fiecare meci, ca biletul să ajungă la cota ta.</p>
        {loadError && <p className="mt-3 text-sm text-rose" role="alert">Nu am putut încărca meciurile. <button type="button" className="underline" onClick={() => { setRows(null); setRetry((x) => x + 1); }}>Reîncearcă</button></p>}
        {!rows && !loadError && <p className="mt-3 text-sm text-muted" role="status">Se încarcă meciurile…</p>}
        {rows && !groups.length && <p className="mt-3 text-sm text-muted">{q ? 'Niciun meci pentru căutarea ta.' : 'Nu sunt meciuri cu cote în următoarele 7 zile.'}</p>}
        <div className="mt-3 space-y-3">
          {groups.map((g) => {
            const ids = g.items.map((m) => m.id);
            const expanded = !!q || open.includes(g.id);
            const all = ids.every((id) => sel.has(id)); const some = !all && ids.some((id) => sel.has(id));
            return (
              <section key={g.id} className="rounded-lg border border-line">
                <div className="flex items-center gap-2 bg-panel-2 px-3 py-2 text-sm font-semibold">
                  <input type="checkbox" aria-label={`Bifează tot ${g.league}`} checked={all} ref={(el) => { if (el) el.indeterminate = some; }} onChange={() => toggleLeague(ids)} className="h-4 w-4 accent-cyan" />
                  <button type="button" onClick={() => toggleOpen(g.id)} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                    <span className="truncate">{g.league}{g.country ? <span className="ml-1 font-normal text-muted">· {g.country}</span> : null}</span>
                    <span className="ml-auto shrink-0 text-xs font-normal text-muted">{some || all ? `${ids.filter((id) => sel.has(id)).length}/` : ''}{g.items.length} {g.items.length === 1 ? 'meci' : 'meciuri'}</span>
                  </button>
                </div>
                {expanded && <ul>
                  {g.items.map((m) => (
                    <li key={m.id} className="border-t border-line/60">
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                        <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} className="h-4 w-4 accent-cyan" />
                        <span className="min-w-0 flex-1 truncate">{m.home} – {m.away}{m.history === false && <span className="ml-2 rounded border border-gold/40 px-1 py-px text-[10px] font-semibold text-gold" title="Fără istoric de rezultate: agenții decid din cote, știri și context">fără istoric</span>}</span>
                        <span className="shrink-0 text-xs text-muted">{when(m.kickoff)}</span>
                        {m.odds && <span className="tabular hidden shrink-0 text-xs text-muted sm:inline">{[m.odds.home, m.odds.draw, m.odds.away].map((x) => (x ? x.toFixed(2) : '–')).join(' · ')}</span>}
                      </label>
                    </li>
                  ))}
                </ul>}
              </section>
            );
          })}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="font-display text-lg font-bold">Agenții</h2>
        <p className="mt-1 text-[11px] text-muted">Până la {MAX_CUSTOM_AGENTS}. Echipa preselectată e formată din cei mai buni agenți ai momentului.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {agents.map((a) => <button key={a.id} type="button" aria-pressed={chosen.includes(a.id)} onClick={() => toggleAgent(a.id)} title={a.specialty} className={`chip ${chosen.includes(a.id) ? 'border-cyan text-cyan' : 'text-muted'}`}>{chosen.includes(a.id) && <Check size={12} aria-hidden />} {a.name}</button>)}
        </div>
      </div>

      <div className="sticky bottom-[4.75rem] z-10 rounded-xl border border-line bg-ink/95 p-3 backdrop-blur md:bottom-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            <strong className="tabular">{n}</strong> {n === 1 ? 'meci ales' : 'meciuri alese'}
            {n > 0 && <span className="text-muted"> · cotă medie necesară ~{perLeg.toFixed(2)} pe meci</span>}
          </p>
          <button type="button" onClick={create} disabled={!ready} className="btn btn-primary ml-auto px-6 py-3 text-base disabled:opacity-50">{busy ? 'Se trimite…' : 'Trimite la analiză'}</button>
        </div>
        {tooLow && <p className="mt-1 text-xs text-rose" role="alert">Cota {target} din {n} meciuri înseamnă ~{perLeg.toFixed(2)} pe meci, prea mică. Alege mai puține meciuri sau o cotă mai mare.</p>}
        {tooHigh && <p className="mt-1 text-xs text-rose" role="alert">Cota {target} din {n} meciuri înseamnă ~{perLeg.toFixed(2)} pe meci, prea mare. Alege mai multe meciuri sau o cotă mai mică.</p>}
        {remaining <= 0 && <p className="mt-1 text-xs text-rose" role="alert">Ai folosit cele {limit} bilete custom de azi.</p>}
        {credits !== null && <p className="mt-1 text-xs text-muted">Credite disponibile: {credits}</p>}
        {error && <p className="mt-1 text-xs text-rose" role="alert">{error}</p>}
      </div>
    </div>
  );
}
