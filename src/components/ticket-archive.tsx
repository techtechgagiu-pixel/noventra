'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { OUTCOME_RO, fmtDateTime, odds } from '@/lib/format';
import { SLOTS_UI } from '@/lib/slots-ui';
import { TicketPerformance } from './ticket-performance';
import type { Creator } from '@/lib/views';

export function CreatorBadge({ c, small }: { c?: Creator; small?: boolean }) {
  if (!c) return null;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${small ? 'text-[11px]' : 'text-xs'} text-muted`} title={c.detail ?? c.name}>
      {c.picture ? <img src={c.picture} alt="" referrerPolicy="no-referrer" className="h-4 w-4 shrink-0 rounded-full" /> : <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-line text-[9px] font-bold text-text">{c.name.slice(0, 1).toUpperCase()}</span>}
      <span className="truncate">creat de <strong className="font-semibold text-text">{c.mine ? 'tine' : c.name}</strong>{!c.mine && c.detail ? ` · ${c.detail}` : ''}</span>
    </span>
  );
}

type T = { id: string; slot: string; period_key: string; target_odds: number; actual_odds: number | null; leg_count: number; generation_status: string; outcome_status: string; created_at: string; creator?: Creator; selections: Array<{ match: string; label: string; odds: number; outcome: string; market_key?: string; model_probability?: number | null }> };
const FILTERS = [['all', 'Toate'], ['today', 'Azi'], ['yesterday', 'Ieri'], ['week', 'Săptămâna asta'], ['weekly', 'Biletul săptămânii'], ['COMPLETED', 'Complete'], ['INCOMPLETE', 'Incomplete'], ['NO_BET', 'NO BET'], ['PENDING', 'În așteptare'], ['settled', 'Câștigate / pierdute']] as const;
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(d);

export function TicketArchive({ tickets, initialFilter = 'all', title = 'Bilete create' }: { tickets: T[]; initialFilter?: string; title?: string }) {
  const [f, setF] = useState<string>(initialFilter);
  const [who, setWho] = useState<string>('all');
  const creators = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    for (const t of tickets) if (t.creator && !t.creator.mine) { const k = `${t.creator.name}|${t.creator.detail ?? ''}`; m.set(k, { label: t.creator.detail ? `${t.creator.name} (${t.creator.detail})` : t.creator.name, n: (m.get(k)?.n ?? 0) + 1 }); }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [tickets]);
  const today = dayKey(new Date()); const yesterday = dayKey(new Date(Date.now() - 86400_000));
  const monday = (() => { const d = new Date(`${today}T12:00:00Z`); const w = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - w + 1); return d.toISOString().slice(0, 10); })();
  const list = useMemo(() => tickets.filter((t) => {
    if (who === 'mine' && !t.creator?.mine) return false;
    if (who !== 'all' && who !== 'mine' && `${t.creator?.name}|${t.creator?.detail ?? ''}` !== who) return false;
    const d = dayKey(new Date(t.created_at));
    switch (f) { case 'today': return d === today; case 'yesterday': return d === yesterday; case 'week': return d >= monday; case 'weekly': return t.slot === 'WEEKLY_100';
      case 'COMPLETED': case 'INCOMPLETE': case 'NO_BET': return t.generation_status === f; case 'PENDING': return t.outcome_status === 'PENDING'; case 'settled': return ['WON', 'LOST', 'PARTIAL_VOID'].includes(t.outcome_status); default: return true; }
  }), [tickets, f, who, today, yesterday, monday]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><h1 className="font-display text-2xl font-bold">{title}</h1><p className="text-sm text-muted">Biletele tuturor conturilor, cu numele celui care le-a creat.</p></div>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">Creat de
          <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-lg border border-line bg-ink px-2 py-1.5 text-text">
            <option value="all">toată lumea ({tickets.length})</option>
            <option value="mine">mine ({tickets.filter((t) => t.creator?.mine).length})</option>
            {creators.map(([k, v]) => <option key={k} value={k}>{v.label} ({v.n})</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">{FILTERS.map(([k, l]) => <button key={k} onClick={() => setF(k)} className={`chip ${f === k ? 'border-cyan text-cyan' : 'text-muted'}`} aria-pressed={f === k}>{l}</button>)}</div>
      {list.length === 0 ? <div className="card p-8 text-center text-muted">Niciun bilet în această categorie.</div> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((t) => (
            <li key={t.id}>
              <Link href={`/?tab=istoric&ticket=${t.id}`} className={`card block p-4 transition hover:border-cyan/50 ${t.outcome_status === 'WON' || t.outcome_status === 'PARTIAL_VOID' ? 'border-emerald bg-emerald/10' : t.outcome_status === 'LOST' ? 'border-rose bg-rose/10' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold">{SLOTS_UI[t.slot] ?? (t.slot.startsWith('CUSTOM_') ? `CUSTOM — COTĂ ${t.target_odds}` : t.slot.startsWith('REVIEW_') ? `BILETUL TĂU — COTĂ ${t.target_odds}` : t.slot)}</p><p className="text-xs text-muted">{fmtDateTime(t.created_at)}</p><div className="mt-1"><CreatorBadge c={t.creator} small /></div></div>
                  <div className="text-right"><p className="font-display text-2xl font-bold tabular">{t.generation_status === 'COMPLETED' ? odds(t.actual_odds) : '—'}</p><p className="text-xs text-muted">țintă {t.target_odds}</p></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className={`chip ${t.generation_status === 'COMPLETED' ? 'text-emerald' : 'text-gold'}`}>{t.generation_status === 'COMPLETED' ? `${t.leg_count} meciuri` : t.generation_status === 'NO_BET' ? 'NO BET' : 'Incomplet'}</span>
                  {t.generation_status === 'COMPLETED' && <span className={`chip ${t.outcome_status === 'WON' ? 'text-emerald' : t.outcome_status === 'LOST' ? 'text-rose' : 'text-muted'}`}>{OUTCOME_RO[t.outcome_status]}</span>}
                </div>
                {t.selections.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs">
                    {t.selections.map((s, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.outcome === 'WON' ? 'bg-emerald' : s.outcome === 'LOST' ? 'bg-rose' : s.outcome === 'VOID' ? 'bg-muted' : 'border border-muted'}`} aria-label={s.outcome === 'WON' ? 'a intrat' : s.outcome === 'LOST' ? 'nu a intrat' : s.outcome === 'VOID' ? 'anulat' : 'în așteptare'} />
                        <span className={`truncate ${s.outcome === 'LOST' ? 'text-rose' : s.outcome === 'WON' ? 'text-emerald' : 'text-muted'}`}>{s.match} — {s.label} @ {odds(s.odds)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <TicketPerformance tickets={list} />
    </div>
  );
}
