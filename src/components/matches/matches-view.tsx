'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Search } from 'lucide-react';
import { api } from '@/lib/format';
import { useVisibleRefresh } from '@/lib/use-visible-refresh';
import type { MatchRow } from '@/lib/catalog';
import type { InformationalSourceStatus } from '@/lib/sports/the-odds-catalog';
import { LeaguePicker, type LeagueOption } from './league-picker';
import { MatchMarkets } from './match-markets';

type Data = { rows: MatchRow[]; leagues: LeagueOption[]; refreshing: boolean; updatedAt: string | null; errors: number; additionalSource?: InformationalSourceStatus };
type Source = 'all' | 'existing' | 'the-odds-api';
const fromSource = (m: MatchRow, source: Source) => {
  const sources = m.sources ?? (m.source ? [m.source] : []);
  return source === 'all' || (source === 'existing' ? m.source !== 'the-odds-api' : sources.includes(source));
};
const TZ = 'Europe/Bucharest';
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const dayOf = (iso: string) => dayFormatter.format(new Date(iso));
const PAGE_SIZE = 120;
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
  if (m.source === 'the-odds-api') return <span className="text-muted/70">The Odds API{m.odds ? ` · ${m.odds.markets} pronosticuri (mediana caselor)` : ' · program informativ'}{m.status === 'unknown' ? ' · scor indisponibil' : ''}</span>;
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
  const [source, setSource] = useState<Source>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { setLimit(PAGE_SIZE); }, [leagues, day, status, hideDone, q, source]);

  const load = useCallback(async () => {
    try { setData(await api<Data>('/api/matches?includeInformational=1')); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { setToday(dayOf(new Date().toISOString())); void load(); }, [load]);
  // Prices change at most every few hours (The Odds API: every 3 days); a 5-minute refresh is plenty.
  useVisibleRefresh(load, 5 * 60_000);
  // While the source is being refreshed in the background, pick up the new snapshot.
  useEffect(() => { if (!data?.refreshing) return; const t = setTimeout(load, 15_000); return () => clearTimeout(t); }, [data, load]);

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // A schedule-only match whose kickoff passed has no score from its source: treat it as finished.
  const done = (m: MatchRow) => m.status === 'post' || (m.status === 'unknown' && Date.parse(m.kickoff) < Date.now() - 2 * 3600_000);
  const base = useMemo(() => (data?.rows ?? []).filter((m) => fromSource(m, source) && (!hideDone || !done(m)) && (!leagues.length || leagues.includes(m.leagueId)) && (!q || norm(`${m.home} ${m.away} ${m.league} ${m.country}`).includes(norm(q)))), [data, leagues, q, hideDone, source]);
  const days = useMemo(() => [...new Set(base.map((m) => dayOf(m.kickoff)))].sort(), [base]);
  const shown = useMemo(() => base.filter((m) => (day === 'all' || dayOf(m.kickoff) === day) && (
    status === 'all' ? true : status === 'odds' ? !!m.odds : status === 'analyzed' ? !!m.analysis : status === 'ticket' ? !!m.analysis?.onTicket : !m.analysis && !!m.odds))
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id)), [base, day, status]);
  const groups = useMemo(() => {
    const by = new Map<string, MatchRow[]>();
    for (const m of shown.slice(0, limit)) { const k = `${m.country} · ${m.league}`; by.set(k, [...(by.get(k) ?? []), m]); }
    return [...by.entries()];
  }, [shown, limit]);
  const counts = { all: data?.rows.length ?? 0, odds: data?.rows.filter((m) => m.odds).length ?? 0, analyzed: data?.rows.filter((m) => m.analysis).length ?? 0 };
  const pickerLeagues = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of data?.rows ?? []) if ((!hideDone || !done(m)) && fromSource(m, source)) counts.set(m.leagueId, (counts.get(m.leagueId) ?? 0) + 1);
    return (data?.leagues ?? []).map((l) => ({ ...l, count: counts.get(l.id) ?? 0 }));
  }, [data, hideDone, source]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="page-title">Toate meciurile</h1>
          <p className="text-sm text-muted">
            {data ? <>{counts.all} meciuri în {data.leagues.filter((l) => l.count).length} ligi · {counts.odds} cu cote · {counts.analyzed} analizate în comunitate</> : 'Încarc meciurile din toate ligile…'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted">
          {data?.refreshing && <span className="flex items-center gap-1 text-cyan"><RefreshCw size={12} className="animate-spin" aria-hidden /> se actualizează</span>}
          {data?.updatedAt && <span suppressHydrationWarning>actualizat {time(data.updatedAt)}</span>}
          <button onClick={() => void load()} className="btn btn-ghost px-2 py-1" aria-label="Reîncarcă"><RefreshCw size={14} /></button>
        </div>
      </div>

      {data?.additionalSource && <div className="rounded-xl border border-line bg-ink/40 px-3 py-2 text-xs text-muted" role="status">
        <span className="font-semibold text-cyan">ESPN / LPF + The Odds API</span>
        {data.additionalSource.configured ? <>
          {' · '}{data.additionalSource.leaguesLoaded}/{data.additionalSource.leaguesTotal} competiții suplimentare încărcate
          {data.additionalSource.updatedAt && <> · program de la {new Date(data.additionalSource.updatedAt).toLocaleString('ro-RO', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</>}
          {data.additionalSource.creditsRemaining !== null && <> · {data.additionalSource.creditsRemaining} credite disponibile</>}
          {data.additionalSource.refreshing && ' · se încarcă programul suplimentar'}
          {data.additionalSource.error && <p className="mt-1 text-gold">{data.additionalSource.error}</p>}
        </> : ' · sursa suplimentară nu este configurată'}
      </div>}

      {data?.additionalSource?.configured && <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sursa meciurilor">
        {([{ id: 'all', label: 'Toate sursele' }, { id: 'existing', label: 'ESPN / LPF' }, { id: 'the-odds-api', label: 'The Odds API' }] as const).map((s) =>
          <button key={s.id} onClick={() => { setSource(s.id); setLeagues([]); setDay('all'); setStatus('all'); }} aria-pressed={source === s.id} className={`chip ${source === s.id ? 'text-cyan' : 'text-muted'}`}>{s.label}</button>)}
      </div>}

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
                <li key={m.id}>
                <div role="button" tabIndex={0} aria-expanded={open === m.id} onClick={() => setOpen((o) => (o === m.id ? null : m.id))} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => (o === m.id ? null : m.id)); } }}
                  className={`grid cursor-pointer grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-2.5 transition hover:bg-panel-2/60 sm:grid-cols-[64px_minmax(0,1fr)_auto] ${open === m.id ? 'bg-panel-2/60' : ''}`}>
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
                    <p className="truncate text-xs"><Verdict m={m} />{m.source !== 'the-odds-api' && m.sources?.includes('the-odds-api') && <span className="ml-2 text-muted/70">· program confirmat și de The Odds API</span>}</p>
                  </div>
                  <div className="col-start-2 flex items-center gap-1.5 text-xs tabular sm:col-start-3 sm:justify-end">
                    {m.odds && (['home', 'draw', 'away'] as const).map((k, i) => (
                      <span key={k} className="odds-cell"><span>{['1', 'X', '2'][i]}</span><b>{m.odds![k]?.toFixed(2) ?? '—'}</b></span>
                    ))}
                    {m.odds && <span className="whitespace-nowrap text-cyan">{m.odds.markets} piețe {open === m.id ? '▴' : '▾'}</span>}
                    {m.analysis && <Link href={`/?tab=analiza&job=${m.analysis.jobId}`} onClick={(e) => e.stopPropagation()} className="text-cyan hover:underline">jurnal</Link>}
                  </div>
                </div>
                {open === m.id && <div className="border-t border-line/60 bg-ink/40 px-4 py-3"><MatchMarkets id={m.id} /></div>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {shown.length > 0 && <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted">
        <span>Afișate {Math.min(limit, shown.length)} din {shown.length} meciuri</span>
        {limit < shown.length && <button onClick={() => setLimit((n) => n + PAGE_SIZE)} className="btn btn-ghost">Arată mai multe meciuri</button>}
      </div>}
      {data && data.errors > 0 && <p className="text-xs text-muted">{data.errors} cereri către sursă au eșuat; meciurile lor apar la următoarea actualizare.</p>}
      <p className="text-xs text-muted">Surse: The Odds API este sursa principală de cote (mediana caselor de pariuri, rezultat final și goluri peste/sub pe toate liniile), actualizată o dată la 3 zile pentru următoarele 7 zile; ESPN și LPF rămân în fundal pentru program, scoruri, istoric și piețele pe care The Odds API nu le are. Apasă pe un meci ca să vezi toate pronosticurile.</p>
    </div>
  );
}
