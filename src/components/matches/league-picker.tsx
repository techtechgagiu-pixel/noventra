'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

/** Leagues pinned at the top, in this order; every `top10` league follows. */
export const PINNED_LEAGUES = ['UCL', 'UEL', 'UECL', 'ROU1'];
export type LeagueOption = { id: string; name: string; country: string; top10?: boolean; count: number };

/**
 * Drop-down with a checkbox per league. At the top a „Principale” block: Champions / Europa / Conference League, the Romanian SuperLiga and the other
 * top-10 leagues (owner request 06.11); then every league grouped by country. An empty selection means "all leagues" and shows every league ticked;
 * while it is untouched, ticking a league keeps ONLY that one (06.11, replaces the 03.11 "un-tick one = all the others"); after that every click toggles.
 * Leagues without fixtures in the current window are listed last and dimmed.
 */
export function LeaguePicker({ leagues, value, onChange, label = 'Ligi', allLabel = 'Toate ligile' }: { leagues: LeagueOption[]; value: string[]; onChange: (ids: string[]) => void; label?: string; allLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cleared, setCleared] = useState(false); // „Debifează tot”: nothing ticked yet (an empty value normally means every league)
  useEffect(() => { if (value.length) setCleared(false); }, [value]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const principal = useMemo(() => {
    const rank = (l: LeagueOption) => { const i = PINNED_LEAGUES.indexOf(l.id); return i >= 0 ? i : PINNED_LEAGUES.length; };
    return leagues.filter((l) => PINNED_LEAGUES.includes(l.id) || l.top10).sort((a, b) => rank(a) - rank(b) || a.country.localeCompare(b.country, 'ro'));
  }, [leagues]);
  const principalIds = useMemo(() => new Set(principal.map((l) => l.id)), [principal]);
  const groups = useMemo(() => {
    // Without a search the pinned leagues live only in the „Principale” block; a search lists them again with their country.
    const shown = leagues.filter((l) => (q ? norm(`${l.country} ${l.name}`).includes(norm(q)) : !principalIds.has(l.id)));
    const by = new Map<string, LeagueOption[]>();
    for (const l of [...shown].sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || a.country.localeCompare(b.country, 'ro') || a.name.localeCompare(b.name, 'ro'))) by.set(l.country, [...(by.get(l.country) ?? []), l]);
    return [...by.entries()];
  }, [leagues, q, principalIds]);

  const everything = !value.length && !cleared;
  const set = new Set(everything ? leagues.map((l) => l.id) : cleared ? [] : value);
  const commit = (ids: string[]) => onChange(leagues.every((l) => ids.includes(l.id)) ? [] : ids);
  const current = [...set];
  // Untouched "all leagues": a click picks just that league (or country); afterwards clicks add and remove.
  const toggle = (id: string) => (everything ? onChange([id]) : commit(set.has(id) ? current.filter((x) => x !== id) : [...current, id]));
  const toggleCountry = (ids: string[]) => (everything ? onChange(ids) : commit(ids.every((id) => set.has(id)) ? current.filter((x) => !ids.includes(x)) : [...new Set([...current, ...ids])]));
  const matches = cleared ? 0 : value.length ? leagues.filter((l) => set.has(l.id)).reduce((s, l) => s + l.count, 0) : leagues.reduce((s, l) => s + l.count, 0);
  const summary = cleared ? 'Nicio ligă bifată' : !value.length ? allLabel : value.length === 1 ? leagues.find((l) => l.id === value[0])?.name ?? '1 ligă' : `${value.length} ligi`;

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox"
        className="flex w-full items-center gap-2 rounded-xl border border-line bg-ink px-3 py-2.5 text-left text-sm hover:border-cyan/60">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{summary}</span>
        <span className="tabular text-xs text-muted">{matches} meciuri</span>
        <ChevronDown size={16} className={`text-muted transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-2 max-h-[min(70vh,520px)] min-w-[280px] overflow-hidden rounded-xl border border-line bg-panel shadow-2xl sm:right-auto sm:w-[420px]">
          <div className="flex items-center gap-2 border-b border-line p-2">
            <Search size={14} className="text-muted" aria-hidden />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută țară sau ligă" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </div>
          <div className="flex flex-wrap gap-1.5 border-b border-line p-2">
            <button type="button" onClick={() => { setCleared(false); onChange([]); }} className={`chip ${!value.length && !cleared ? 'text-cyan' : 'text-muted'}`}>{allLabel}</button>
            <button type="button" onClick={() => { setCleared(true); onChange([]); }} className={`chip ${cleared ? 'text-cyan' : 'text-muted'}`}>Debifează tot</button>
            <button type="button" onClick={() => onChange(principal.map((l) => l.id))} className="chip text-muted">Principale</button>
            <button type="button" onClick={() => onChange(leagues.filter((l) => l.top10).map((l) => l.id))} className="chip text-muted">Top 10</button>
            <button type="button" onClick={() => onChange(leagues.filter((l) => l.count > 0).map((l) => l.id))} className="chip text-muted">Doar cu meciuri</button>
          </div>
          <div role="listbox" aria-multiselectable="true" className="max-h-[min(55vh,400px)] overflow-y-auto p-1">
            {!q && principal.length > 0 && (() => {
              const ids = principal.map((l) => l.id); const all = ids.every((id) => set.has(id));
              return (
                <div className="py-1">
                  <button type="button" onClick={() => toggleCountry(ids)} className="flex w-full items-center justify-between px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-cyan hover:text-text">
                    Principale<span className={all ? 'text-cyan' : 'text-muted'}>{all ? 'debifează' : 'bifează tot'}</span>
                  </button>
                  {principal.map((l) => <LeagueRow key={l.id} l={l} on={set.has(l.id)} onToggle={() => toggle(l.id)} showCountry />)}
                </div>
              );
            })()}
            {groups.map(([country, ls]) => {
              const ids = ls.map((l) => l.id); const all = ids.every((id) => set.has(id));
              return (
                <div key={country} className="py-1">
                  <button type="button" onClick={() => toggleCountry(ids)} className="flex w-full items-center justify-between px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted hover:text-text">
                    {country}<span className={all ? 'text-cyan' : ''}>{all ? 'debifează' : 'bifează tot'}</span>
                  </button>
                  {ls.map((l) => <LeagueRow key={l.id} l={l} on={set.has(l.id)} onToggle={() => toggle(l.id)} />)}
                </div>
              );
            })}
            {!groups.length && <p className="p-3 text-sm text-muted">Nicio ligă găsită.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function LeagueRow({ l, on, onToggle, showCountry }: { l: LeagueOption; on: boolean; onToggle: () => void; showCountry?: boolean }) {
  return (
    <button type="button" role="option" aria-selected={on} onClick={onToggle}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink ${l.count ? '' : 'opacity-45'}`}>
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-transparent bg-cyan text-ink' : 'border-line'}`}>{on && <Check size={11} strokeWidth={3} />}</span>
      <span className="min-w-0 flex-1 truncate">{l.name}{showCountry && <span className="ml-1.5 text-xs text-muted">{l.country}</span>}</span>
      <span className="tabular text-xs text-muted">{l.count}</span>
    </button>
  );
}
