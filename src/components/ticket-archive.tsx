'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { OUTCOME_RO, fmtDateTime, odds } from '@/lib/format';
import { SLOTS_UI } from '@/lib/slots-ui';

type T = { id: string; slot: string; period_key: string; target_odds: number; actual_odds: number | null; leg_count: number; generation_status: string; outcome_status: string; created_at: string; selections: Array<{ match: string; label: string; odds: number; outcome: string }> };
const FILTERS = [['all', 'Toate'], ['today', 'Azi'], ['yesterday', 'Ieri'], ['week', 'Săptămâna asta'], ['weekly', 'Biletul săptămânii'], ['COMPLETED', 'Complete'], ['INCOMPLETE', 'Incomplete'], ['NO_BET', 'NO BET'], ['PENDING', 'În așteptare'], ['settled', 'Câștigate / pierdute']] as const;
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(d);

export function TicketArchive({ tickets }: { tickets: T[] }) {
  const [f, setF] = useState<string>('all');
  const today = dayKey(new Date()); const yesterday = dayKey(new Date(Date.now() - 86400_000));
  const monday = (() => { const d = new Date(`${today}T12:00:00Z`); const w = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - w + 1); return d.toISOString().slice(0, 10); })();
  const list = useMemo(() => tickets.filter((t) => {
    const d = dayKey(new Date(t.created_at));
    switch (f) { case 'today': return d === today; case 'yesterday': return d === yesterday; case 'week': return d >= monday; case 'weekly': return t.slot === 'WEEKLY_100';
      case 'COMPLETED': case 'INCOMPLETE': case 'NO_BET': return t.generation_status === f; case 'PENDING': return t.outcome_status === 'PENDING'; case 'settled': return ['WON', 'LOST'].includes(t.outcome_status); default: return true; }
  }), [tickets, f, today, yesterday, monday]);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Biletele mele</h1>
      <div className="flex flex-wrap gap-2">{FILTERS.map(([k, l]) => <button key={k} onClick={() => setF(k)} className={`chip ${f === k ? 'border-cyan text-cyan' : 'text-muted'}`} aria-pressed={f === k}>{l}</button>)}</div>
      {list.length === 0 ? <div className="card p-8 text-center text-muted">Niciun bilet în această categorie.</div> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((t) => (
            <li key={t.id}>
              <Link href={`/tickets/${t.id}`} className="card block p-4 transition hover:border-cyan/50">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold">{SLOTS_UI[t.slot]}</p><p className="text-xs text-muted">{fmtDateTime(t.created_at)}</p></div>
                  <div className="text-right"><p className="font-display text-2xl font-bold tabular">{t.generation_status === 'COMPLETED' ? odds(t.actual_odds) : '—'}</p><p className="text-xs text-muted">țintă {t.target_odds}</p></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className={`chip ${t.generation_status === 'COMPLETED' ? 'text-emerald' : 'text-gold'}`}>{t.generation_status === 'COMPLETED' ? `${t.leg_count} meciuri` : t.generation_status === 'NO_BET' ? 'NO BET' : 'Incomplet'}</span>
                  {t.generation_status === 'COMPLETED' && <span className={`chip ${t.outcome_status === 'WON' ? 'text-emerald' : t.outcome_status === 'LOST' ? 'text-rose' : 'text-muted'}`}>{OUTCOME_RO[t.outcome_status]}</span>}
                </div>
                {t.selections.length > 0 && <p className="mt-2 line-clamp-2 text-xs text-muted">{t.selections.map((s) => s.match).join(' · ')}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
