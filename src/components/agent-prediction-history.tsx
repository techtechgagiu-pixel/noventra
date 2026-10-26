'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fmtDateTime } from '@/lib/format';
import type { AgentStat } from '@/lib/agent-stats';

const FILTERS = [['decided', 'Decise'], ['pending', 'În așteptare'], ['WON', 'Verzi'], ['LOST', 'Roșii'], ['VOID', 'Anulate'], ['NO_BET', 'NO BET'], ['all', 'Toate']] as const;
const PAGE_SIZE = 8;
const outcomeText: Record<string, string> = { WON: 'Verde', LOST: 'Roșu', VOID: 'Anulat' };
export function AgentPredictionHistory({ agent, entries: initialEntries, source, total }: { agent: string; entries?: AgentStat['recent']; source?: { url: string; revision: string }; total?: number }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ key: string; entries: AgentStat['recent'] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const key = source ? `${source.url}:${source.revision}` : '';
  const ready = initialEntries !== undefined || loaded?.key === key;
  const entries = initialEntries ?? (loaded?.key === key ? loaded.entries : []);
  const url = source?.url;
  useEffect(() => {
    if (!open || ready || !url) return;
    const controller = new AbortController();
    setError(null);
    void fetch(url, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.entries)) throw new Error(data.error ?? 'Nu am putut încărca pronosticurile.');
      if (!controller.signal.aborted) setLoaded({ key, entries: data.entries });
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [open, ready, url, key, retry]);
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const matches = (r: AgentStat['recent'][number], f: string) => f === 'all' ? true : f === 'NO_BET' ? r.decision === 'NO_BET' : r.decision !== 'BET_CANDIDATE' ? false : f === 'decided' ? ['WON','LOST'].includes(r.outcome ?? '') : f === 'pending' ? !r.outcome : r.outcome === f;
  const list = useMemo(() => entries.filter((r) => matches(r, filter)), [entries, filter]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  return <details className="group mt-3" aria-label={`Istoric ${agent}`} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-xs font-semibold text-cyan">Pronosticuri și rezultate ({ready ? entries.length : total ?? 0})</summary>
    {!ready ? <div className="mt-2 text-xs text-muted" role={error ? 'alert' : 'status'}>{error ? <>{error} <button className="text-cyan" onClick={() => setRetry(n => n + 1)}>Reîncearcă</button></> : 'Se încarcă pronosticurile…'}</div> : <>
    <p className="mt-2 text-[11px] text-muted">Aceeași lună și sferă ca în clasament. O poziție finală pe meci; NO BET nu este o pierdere. Biletul echipei poate avea altă selecție.</p>
    <label className="mt-2 block text-xs text-muted">Rezultate {agent}
      <select className="mt-1 w-full rounded-lg border border-line bg-ink p-2 text-text" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}>
        {FILTERS.map(([value,label]) => <option key={value} value={value}>{label} ({entries.filter((r) => matches(r,value)).length})</option>)}
      </select>
    </label>
    <p className="mt-2 text-[11px] text-muted">{list.length ? `${current * PAGE_SIZE + 1}–${Math.min((current + 1) * PAGE_SIZE, list.length)} din ${list.length}` : 'Nicio poziție pentru acest filtru.'}</p>
    <ul className="mt-2 space-y-2">
      {list.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((r) => <li key={r.predictionId} className="border-t border-line pt-2 text-xs">
        <p className="font-semibold text-text">{r.match}{r.score ? ` (${r.score})` : ''}</p>
        <p className="text-muted">{r.league} · Meci: {fmtDateTime(r.kickoff)}</p>
        <p>{r.decision === 'NO_BET' ? 'NO BET — fără pronostic' : r.label}{r.decision === 'BET_CANDIDATE' && r.odds ? ` @ ${r.odds.toFixed(2)}` : ''}</p>
        {r.decision === 'BET_CANDIDATE' && <p className={r.outcome === 'WON' ? 'text-emerald' : r.outcome === 'LOST' ? 'text-rose' : 'text-muted'}>{outcomeText[r.outcome ?? ''] ?? (r.status === 'in' ? 'Live · rezultat neconfirmat' : r.status === 'pre' && Date.parse(r.kickoff) > Date.now() ? 'Meci viitor' : 'Așteaptă confirmare')}</p>}
        <p className="text-muted">Analizat: {fmtDateTime(r.at)} · runda {r.round + 1}</p>
        <p className="truncate text-[10px] text-muted" title={r.model}>{r.model}</p>
        <Link href={`/?tab=analiza&job=${r.jobId}`} className="text-cyan">Jurnalul acestei analize</Link>
        {r.fixtureId.startsWith('espn:') && <> · <a className="text-cyan" href={`https://www.espn.com/soccer/match/_/gameId/${r.fixtureId.slice(5)}`} target="_blank" rel="noreferrer">sursa meciului</a></>}
      </li>)}
    </ul>
    {pages > 1 && <div className="mt-3 flex items-center justify-between gap-2 text-xs"><button className="chip" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label={`Pagina anterioară ${agent}`}>←</button><span>{current + 1} / {pages}</span><button className="chip" disabled={current === pages - 1} onClick={() => setPage(current + 1)} aria-label={`Pagina următoare ${agent}`}>→</button></div>}
    </>}
  </details>;
}
