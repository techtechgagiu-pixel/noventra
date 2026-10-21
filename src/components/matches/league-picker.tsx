'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export type LeagueOption = { id: string; name: string; country: string; top10?: boolean; count: number };

/**
 * Drop-down with a checkbox per league, grouped by country. An empty selection means "all leagues".
 * Leagues without fixtures in the current window are listed last and dimmed.
 */
export function LeaguePicker({ leagues, value, onChange, label = 'Ligi', allLabel = 'Toate ligile' }: { leagues: LeagueOption[]; value: string[]; onChange: (ids: string[]) => void; label?: string; allLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const groups = useMemo(() => {
    const shown = leagues.filter((l) => !q || norm(`${l.country} ${l.name}`).includes(norm(q)));
    const by = new Map<string, LeagueOption[]>();
    for (const l of [...shown].sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || a.country.localeCompare(b.country, 'ro') || a.name.localeCompare(b.name, 'ro'))) by.set(l.country, [...(by.get(l.country) ?? []), l]);
    return [...by.entries()];
  }, [leagues, q]);

  const set = new Set(value);
  const toggle = (id: string) => onChange(set.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  const toggleCountry = (ids: string[]) => onChange(ids.every((id) => set.has(id)) ? value.filter((x) => !ids.includes(x)) : [...new Set([...value, ...ids])]);
  const matches = value.length ? leagues.filter((l) => set.has(l.id)).reduce((s, l) => s + l.count, 0) : leagues.reduce((s, l) => s + l.count, 0);
  const summary = !value.length ? allLabel : value.length === 1 ? leagues.find((l) => l.id === value[0])?.name ?? '1 ligă' : `${value.length} ligi`;

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
            <button type="button" onClick={() => onChange([])} className={`chip ${!value.length ? 'text-cyan' : 'text-muted'}`}>{allLabel}</button>
            <button type="button" onClick={() => onChange(leagues.filter((l) => l.top10).map((l) => l.id))} className="chip text-muted">Top 10</button>
            <button type="button" onClick={() => onChange(leagues.filter((l) => l.count > 0).map((l) => l.id))} className="chip text-muted">Doar cu meciuri</button>
          </div>
          <div role="listbox" aria-multiselectable="true" className="max-h-[min(55vh,400px)] overflow-y-auto p-1">
            {groups.map(([country, ls]) => {
              const ids = ls.map((l) => l.id); const all = ids.every((id) => set.has(id));
              return (
                <div key={country} className="py-1">
                  <button type="button" onClick={() => toggleCountry(ids)} className="flex w-full items-center justify-between px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted hover:text-text">
                    {country}<span className={all ? 'text-cyan' : ''}>{all ? 'debifează' : 'bifează tot'}</span>
                  </button>
                  {ls.map((l) => {
                    const on = set.has(l.id);
                    return (
                      <button key={l.id} type="button" role="option" aria-selected={on} onClick={() => toggle(l.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink ${l.count ? '' : 'opacity-45'}`}>
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-transparent bg-cyan text-ink' : 'border-line'}`}>{on && <Check size={11} strokeWidth={3} />}</span>
                        <span className="min-w-0 flex-1 truncate">{l.name}</span>
                        <span className="tabular text-xs text-muted">{l.count}</span>
                      </button>
                    );
                  })}
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
