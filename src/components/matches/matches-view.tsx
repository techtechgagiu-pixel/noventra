'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Search } from 'lucide-react';
import { api } from '@/lib/format';
import { useVisibleRefresh } from '@/lib/use-visible-refresh';
import type { MatchRow } from '@/lib/catalog';
import { LeaguePicker, type LeagueOption } from './league-picker';

type Data = { rows: MatchRow[]; leagues: LeagueOption[]; refreshing: boolean; updatedAt: string | null; errors: number };
const TZ = 'Europe/Bucharest';
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
const time = (iso: string) => new Date(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dayLabel = (d: string, today: string) => {
  const diff = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (diff === 0) return 'Azi'; if (diff === 1) return 'Mâine';
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
};
type Status = 'all' | 'odds' | 'analyzed' | 'ticket' | 'fresh';
const STATUS: Array<{ id: Status; label: string }> = [
  { id: 'all', label: 'Toate' }, { id: 'odds', label: 'Cu cote' }, { id: 'analyzed', label: 'Analizate' }, { id: 'ticket', label: 'Pe bilet' }, { id: 'fresh', label: 'Neanalizate' },
];

function Verdict({ m }: { m: MatchRow }) {
  const a = m.analysis;
  if (a?.onTicket) {
    const outcome = a.selectionOutcome;
    return <span className={outcome === 'WON' ? 'text-emerald' : outcome === 'LOST' ? 'text-rose' : 'text-muted'}>{outcome === 'WON' ? '✓ A intrat' : outcome === 'LOST' ? '✗ Nu a intrat' : outcome === 'VOID' ? 'Anulat' : 'Pe bilet · în așteptare'}: {a.label ?? '—'}{a.odds ? ` @ ${a.odds.toFixed(2)}` : ''}</span>;
  }
  if (a?.outcome === 'QUALIFIED') return <span className="text-cyan">Selecție validată: {a.label ?? '—'} · {a.votes} voturi</span>;
  if (a?.outcome === 'NO_CONSENSUS') return <span className="text-gold">Analizat · fără consens ({a.votes} voturi)</span>;
  if (a?.outcome === 'NO_BET') return <span className="text-muted">Analizat · echipa a zis NO BET</span>;
  if (a?.outcome === 'REJECTED') return <span className="text-rose">Analizat · respins la validare</span>;
  if (!m.odds) return <span className="text-muted/70">Fără cote la sursă — nu poate fi analizat</span>;
  return <span className="text-muted">Neanalizat încă · {m.odds.markets} piețe</span>;
}

export function MatchesView() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<string[]>([]);
  const [day, setDay] = useState<string>('all');
  const [status, setStatus] = useState<Status>('all');
  const [hideDone, setHideDone] = useState(true);
  const [q, setQ] = useState('');
  const [today, setToday] = useState('');

  const load = useCallback(async () => {
    try { setData(await api<Data>('/api/matches')); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { setToday(dayOf(new Date().toISOString())); void load(); }, [load]);
  useVisibleRefresh(load);
  // While the source is being refreshed in the background, pick up the new snapshot.
  useEffect(() => { if (!data?.refreshing) return; const t = setTimeout(load, 15_000); return () => clearTimeout(t); }, [data, load]);

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const base = useMemo(() => (data?.rows ?? []).filter((m) => (!hideDone || m.status !== 'post') && (!leagues.length || leagues.includes(m.leagueId)) && (!q || norm(`${m.home} ${m.away} ${m.league} ${m.country}`).includes(norm(q)))), [data, leagues, q, hideDone]);
  const days = useMemo(() => [...new Set(base.map((m) => dayOf(m.kickoff)))].sort(), [base]);
  const shown = base.filter((m) => (day === 'all' || dayOf(m.kickoff) === day) && (
    status === 'all' ? true : status === 'odds' ? !!m.odds : status === 'analyzed' ? !!m.analysis : status === 'ticket' ? !!m.analysis?.onTicket : !m.analysis && !!m.odds));
  const groups = useMemo(() => {
    const by = new Map<string, MatchRow[]>();
    for (const m of shown) { const k = `${m.country} · ${m.league}`; by.set(k, [...(by.get(k) ?? []), m]); }
    return [...by.entries()];
  }, [shown]);
  const counts = { all: data?.rows.length ?? 0, odds: data?.rows.filter((m) => m.odds).length ?? 0, analyzed: data?.rows.filter((m) => m.analysis).length ?? 0 };
  const pickerLeagues = (data?.leagues ?? []).map((l) => ({ ...l, count: (data?.rows ?? []).filter((m) => m.leagueId === l.id && (!hideDone || m.status !== 'post')).length }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Toate meciurile</h1>
          <p className="text-sm text-muted">
            {data ? <>{counts.all} meciuri în {data.leagues.filter((l) => l.count).length} ligi · {counts.odds} cu cote · {counts.analyzed} analizate de echipă</> : 'Încarc meciurile din toate ligile…'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted">
          {data?.refreshing && <span className="flex items-center gap-1 text-cyan"><RefreshCw size={12} className="animate-spin" aria-hidden /> se actualizează</span>}
          {data?.updatedAt && <span suppressHydrationWarning>actualizat {time(data.updatedAt)}</span>}
          <button onClick={() => void load()} className="btn btn-ghost px-2 py-1" aria-label="Reîncarcă"><RefreshCw size={14} /></button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <LeaguePicker leagues={pickerLeagues} value={leagues} onChange={setLeagues} />
        <label className="flex items-center gap-2 rounded-xl border border-line bg-ink px-3 py-2.5 text-sm">
          <Search size={14} className="text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută echipă, ligă sau țară" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Zi">
        <button onClick={() => setDay('all')} className={`chip ${day === 'all' ? 'text-cyan' : 'text-muted'}`}>Toate zilele</button>
        {days.map((d) => <button key={d} onClick={() => setDay(d)} className={`chip ${day === d ? 'text-cyan' : 'text-muted'}`}>{today ? dayLabel(d, today) : d} <span className="ml-1 tabular opacity-60">{base.filter((m) => dayOf(m.kickoff) === d).length}</span></button>)}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Stare">
        {STATUS.map((s) => <button key={s.id} onClick={() => setStatus(s.id)} className={`chip ${status === s.id ? 'text-cyan' : 'text-muted'}`}>{s.label}</button>)}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="accent-cyan" /> ascunde meciurile terminate</label>
      </div>

      {error && <p className="card p-4 text-sm text-rose" role="alert">{error}</p>}
      {!data && !error && <div className="card animate-pulse p-8 text-center text-sm text-muted">Citesc programul din toate ligile disponibile. Prima încărcare poate dura până la un minut.</div>}
      {data && !shown.length && <p className="card p-6 text-center text-sm text-muted">Niciun meci pentru filtrele alese.</p>}

      <div className="space-y-4">
        {groups.map(([name, ms]) => (
          <section key={name} className="card overflow-hidden">
            <h2 className="flex items-center justify-between border-b border-line bg-ink/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted">{name}<span className="tabular">{ms.length}</span></h2>
            <ul className="divide-y divide-line/60">
              {ms.map((m) => (
                <li key={m.id} className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[64px_minmax(0,1fr)_auto]">
                  <div className="row-span-2 text-xs tabular text-muted sm:row-span-1">
                    {m.status === 'in' ? <span className="font-bold text-rose">LIVE</span> : <span suppressHydrationWarning>{time(m.kickoff)}</span>}
                    {day === 'all' && today && <div className="text-[10px]">{dayLabel(dayOf(m.kickoff), today)}</div>}
                  </div>
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                      {m.homeLogo && <img src={m.homeLogo} alt="" className="h-4 w-4 shrink-0 object-contain" loading="lazy" />}
                      <span className="truncate">{m.home}</span>
                      <span className="shrink-0 text-muted">{m.score ?? '–'}</span>
                      <span className="truncate">{m.away}</span>
                      {m.awayLogo && <img src={m.awayLogo} alt="" className="h-4 w-4 shrink-0 object-contain" loading="lazy" />}
                    </p>
                    <p className="truncate text-xs"><Verdict m={m} /></p>
                  </div>
                  <div className="col-start-2 flex items-center gap-1.5 text-xs tabular sm:col-start-3 sm:justify-end">
                    {m.odds && (['home', 'draw', 'away'] as const).map((k, i) => (
                      <span key={k} className="whitespace-nowrap rounded-md border border-line px-1.5 py-0.5"><span className="text-muted">{['1', 'X', '2'][i]}</span> {m.odds![k]?.toFixed(2) ?? '—'}</span>
                    ))}
                    {m.analysis && <Link href={`/?tab=analiza&job=${m.analysis.jobId}`} className="text-cyan hover:underline">jurnal</Link>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {data && data.errors > 0 && <p className="text-xs text-muted">{data.errors} cereri către sursă au eșuat; meciurile lor apar la următoarea actualizare.</p>}
      <p className="text-xs text-muted">Sursa: ESPN (cote Bet365/DraftKings) și LPF pentru SuperLiga. Doar meciurile cu cote pot intra la analiză.</p>
    </div>
  );
}
