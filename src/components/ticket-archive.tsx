'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { fmtDateTime, odds } from '@/lib/format';
import { SLOTS_UI } from '@/lib/slots-ui';
import { FinishIncompleteTicket } from './finish-incomplete-ticket';
import { TicketPerformance } from './ticket-performance';
import type { IncompletePick } from '@/lib/incomplete-ticket-picks';
import type { Creator } from '@/lib/views';
import { archiveResult } from '@/lib/archive-visibility';

/** Match day and hour on the ticket card, in Romanian time (e.g. "sâm. 31.10 · 21:00"). */
const kickoffShort = (iso: string) => {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  const tz = { timeZone: 'Europe/Bucharest' } as const;
  return `${d.toLocaleDateString('ro-RO', { ...tz, weekday: 'short' })} ${d.toLocaleDateString('ro-RO', { ...tz, day: '2-digit', month: '2-digit' })} · ${d.toLocaleTimeString('ro-RO', { ...tz, hour: '2-digit', minute: '2-digit' })}`;
};

export function CreatorBadge({ c, small }: { c?: Creator; small?: boolean }) {
  if (!c) return null;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${small ? 'text-[11px]' : 'text-xs'} text-muted`} title={c.detail ?? c.name}>
      {c.picture ? <img src={c.picture} alt="" referrerPolicy="no-referrer" className="h-4 w-4 shrink-0 rounded-full" /> : <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-line text-[9px] font-bold text-text">{c.name.slice(0, 1).toUpperCase()}</span>}
      <span className="truncate">creat de <strong className="font-semibold text-text">{c.mine ? 'tine' : c.name}</strong>{!c.mine && c.detail ? ` · ${c.detail}` : ''}</span>
    </span>
  );
}

type T = { id: string; slot: string; period_key: string; target_odds: number; actual_odds: number | null; leg_count: number; generation_status: string; outcome_status: string; created_at: string; creator?: Creator; job_id?: string; job_status?: string; partialSelections?: IncompletePick[]; selections: Array<{ match: string; label: string; odds: number; outcome: string; market_key?: string; model_probability?: number | null; kickoff?: string | null; status?: string | null; home_score?: number | null; away_score?: number | null }> };
const FILTERS = [['all', 'Toate'], ['today', 'Azi'], ['yesterday', 'Ieri'], ['week', 'Săptămâna asta'], ['weekly', 'Biletul săptămânii'], ['PENDING', 'În așteptare'], ['WON', 'Verzi'], ['ONE_LOSS', 'Pierdute la un meci']] as const;
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(d);

export function TicketArchive({ tickets, initialFilter = 'all', title = 'Bilete create' }: { tickets: T[]; initialFilter?: string; title?: string }) {
  const visible = useMemo(() => tickets.filter((t) => archiveResult(t) !== null), [tickets]);
  const [f, setF] = useState<string>(initialFilter);
  const [who, setWho] = useState<string>('all');
  const creators = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    for (const t of visible) if (t.creator && !t.creator.mine) { const k = `${t.creator.name}|${t.creator.detail ?? ''}`; m.set(k, { label: t.creator.detail ? `${t.creator.name} (${t.creator.detail})` : t.creator.name, n: (m.get(k)?.n ?? 0) + 1 }); }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [visible]);
  const today = dayKey(new Date()); const yesterday = dayKey(new Date(Date.now() - 86400_000));
  const monday = (() => { const d = new Date(`${today}T12:00:00Z`); const w = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - w + 1); return d.toISOString().slice(0, 10); })();
  const list = useMemo(() => visible.filter((t) => {
    if (who === 'mine' && !t.creator?.mine) return false;
    if (who !== 'all' && who !== 'mine' && `${t.creator?.name}|${t.creator?.detail ?? ''}` !== who) return false;
    const d = dayKey(new Date(t.created_at));
    switch (f) { case 'today': return d === today; case 'yesterday': return d === yesterday; case 'week': return d >= monday; case 'weekly': return t.slot === 'WEEKLY_100';
      case 'PENDING': case 'WON': case 'ONE_LOSS': return archiveResult(t) === f; default: return true; }
  }), [visible, f, who, today, yesterday, monday]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><h1 className="font-display text-2xl font-bold">{title}</h1><p className="text-sm text-muted">Doar biletele în așteptare, verzi sau cu exact un meci roșu. Lista se schimbă odată cu rezultatele; istoricul complet rămâne salvat.</p></div>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">Creat de
          <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-lg border border-line bg-ink px-2 py-1.5 text-text">
            <option value="all">toată lumea ({visible.length})</option>
            <option value="mine">mine ({visible.filter((t) => t.creator?.mine).length})</option>
            {creators.map(([k, v]) => <option key={k} value={k}>{v.label} ({v.n})</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">{FILTERS.map(([k, l]) => <button key={k} onClick={() => setF(k)} className={`chip ${f === k ? 'border-cyan text-cyan' : 'text-muted'}`} aria-pressed={f === k}>{l}</button>)}</div>
      {list.length === 0 ? <div className="card p-8 text-center text-muted">Niciun bilet în această categorie.</div> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((t) => {
            const result = archiveResult(t);
            const finishing = t.generation_status === 'INCOMPLETE' && ['QUEUED', 'RUNNING', 'WAITING'].includes(t.job_status ?? '');
            const partial = t.generation_status === 'INCOMPLETE' ? t.partialSelections ?? [] : [];
            const shown = t.selections.length ? t.selections : partial.map((s) => ({ match: s.snapshot.match, label: s.market_label, odds: s.odds, outcome: s.outcome, kickoff: s.snapshot.kickoff as string | null, status: null as string | null, home_score: null as number | null, away_score: null as number | null }));
            return (
            <li key={t.id}>
              <Link href={`/?tab=istoric&ticket=${t.id}`} className={`card block p-4 transition hover:border-cyan/50 ${result === 'WON' ? 'border-emerald bg-emerald/10' : result === 'ONE_LOSS' ? 'border-rose bg-rose/10' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold">{SLOTS_UI[t.slot] ?? (t.slot.startsWith('CUSTOM_') ? `CUSTOM — COTĂ ${t.target_odds}` : t.slot.startsWith('REVIEW_') ? `BILETUL TĂU — COTĂ ${t.target_odds}` : t.slot)}</p><p className="text-xs text-muted">{fmtDateTime(t.created_at)}</p><div className="mt-1"><CreatorBadge c={t.creator} small /></div></div>
                  <div className="text-right"><p className="font-display text-2xl font-bold tabular">{t.generation_status === 'COMPLETED' ? odds(t.actual_odds) : '—'}</p><p className="text-xs text-muted">țintă {t.target_odds}</p></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {finishing ? <span className="chip animate-pulse text-cyan">⏳ Se finalizează…</span> : <span className={`chip ${t.generation_status === 'COMPLETED' ? 'text-emerald' : 'text-gold'}`}>{t.generation_status === 'COMPLETED' ? `${t.leg_count} meciuri` : t.generation_status === 'NO_BET' ? 'NO BET' : 'Incomplet'}</span>}
                  <span className={`chip ${result === 'WON' ? 'text-emerald' : result === 'ONE_LOSS' ? 'text-rose' : 'text-muted'}`}>{result === 'WON' ? (partial.length ? 'Selecții verzi' : 'Câștigat') : result === 'ONE_LOSS' ? '1 meci pierdut' : 'În așteptare'}</span>
                </div>
                {partial.length > 0 && <p className="mt-3 text-xs text-muted">{partial.length} selecții acceptate · {finishing ? 'agenții caută acum meciurile care lipsesc; biletul se completează singur' : 'ținta biletului nu a fost atinsă'}</p>}
                {shown.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs">
                    {shown.map((s, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.outcome === 'WON' ? 'bg-emerald' : s.outcome === 'LOST' ? 'bg-rose' : s.outcome === 'VOID' ? 'bg-muted' : 'border border-muted'}`} aria-label={s.outcome === 'WON' ? 'a intrat' : s.outcome === 'LOST' ? 'nu a intrat' : s.outcome === 'VOID' ? 'anulat' : 'în așteptare'} />
                        <span className={`min-w-0 truncate ${s.outcome === 'LOST' ? 'text-rose' : s.outcome === 'WON' ? 'text-emerald' : 'text-muted'}`}>{s.match} — {s.label} @ {odds(s.odds)}</span>
                        <span className="ml-auto shrink-0 tabular text-[11px] text-muted">{s.status === 'in' && s.home_score != null ? <span className="font-semibold text-gold">LIVE {s.home_score}–{s.away_score}</span> : s.status === 'post' && s.home_score != null ? `${s.home_score}–${s.away_score}` : s.kickoff ? kickoffShort(s.kickoff) : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Link>
              {t.generation_status === 'INCOMPLETE' && t.creator?.mine && !finishing && <FinishIncompleteTicket ticketId={t.id} compact />}
            </li>
          ); })}
        </ul>
      )}
      <TicketPerformance tickets={list} />
    </div>
  );
}
