'use client';
import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, fmtDateTime, odds } from '@/lib/format';

type F = { id: string; league: string; country: string; leagueId: string; home: string; away: string; homeLogo?: string; awayLogo?: string; kickoff: string; status: string; score: string | null; source: string; odds: null | { bookmaker: string; observedAt: string; markets: Array<{ key: string; label: string; odds: number }> } };
export function MatchesList() {
  const [data, setData] = useState<{ fixtures: F[]; errors: string[]; fetchedAt: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [league, setLeague] = useState('all');
  useEffect(() => { api<{ fixtures: F[]; errors: string[]; fetchedAt: string }>('/api/fixtures?days=5').then(setData).catch((e) => setErr(e.message)); }, []);
  const leagues = useMemo(() => [...new Set((data?.fixtures ?? []).map((f) => `${f.country} · ${f.league}`))], [data]);
  if (err) return <p className="text-rose">{err}</p>;
  if (!data) return <p className="flex items-center gap-2 text-muted"><Loader2 className="animate-spin" size={16} /> Se încarcă programul real…</p>;
  const list = data.fixtures.filter((f) => league === 'all' || `${f.country} · ${f.league}` === league);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Sursă: ESPN (program și cote DraftKings) · România: LPF (oficial, fără cote). Actualizat {fmtDateTime(data.fetchedAt)}. Vizualizarea nu pornește niciun agent AI.</p>
      {data.errors.length > 0 && <p className="text-xs text-gold">Listă parțială: {data.errors.slice(0, 3).join('; ')}</p>}
      <div className="flex flex-wrap gap-2"><button onClick={() => setLeague('all')} className={`chip ${league === 'all' ? 'text-cyan' : 'text-muted'}`}>Toate ({data.fixtures.length})</button>{leagues.map((l) => <button key={l} onClick={() => setLeague(l)} className={`chip ${league === l ? 'text-cyan' : 'text-muted'}`}>{l}</button>)}</div>
      <ul className="space-y-2">
        {list.map((f) => {
          const one = f.odds?.markets.filter((m) => m.key.startsWith('1X2'));
          return (
            <li key={f.id} className="card-soft grid gap-2 p-3 md:grid-cols-[180px_1fr_auto] md:items-center">
              <div className="text-xs text-muted">{fmtDateTime(f.kickoff)}<br />{f.country} · {f.league}</div>
              <div className="flex items-center gap-2 font-medium">{f.homeLogo && <img src={f.homeLogo} alt="" className="h-5 w-5" />}{f.home} <span className="text-muted">{f.score ?? 'vs'}</span> {f.away}{f.awayLogo && <img src={f.awayLogo} alt="" className="h-5 w-5" />}{f.status === 'in' && <span className="chip text-rose">LIVE</span>}</div>
              <div className="flex gap-2 text-sm tabular">{one?.length ? one.map((m) => <span key={m.key} className="chip" title={m.label}>{m.key.split(':')[1] === 'HOME' ? '1' : m.key.split(':')[1] === 'DRAW' ? 'X' : '2'} {odds(m.odds)}</span>) : <span className="text-xs text-muted">fără cote</span>}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
