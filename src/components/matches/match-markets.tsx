'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/format';
import type { MarketQuote } from '@/lib/sports/types';

type Data = { bookmaker: string | null; observedAt: string | null; markets: MarketQuote[] };
const GROUPS: Array<{ type: MarketQuote['marketType']; title: string }> = [
  { type: '1X2', title: 'Rezultat final' }, { type: 'DOUBLE_CHANCE', title: 'Șansă dublă' }, { type: 'TOTAL', title: 'Goluri în meci (peste / sub)' },
  { type: 'BTTS', title: 'Ambele marchează' }, { type: 'TEAM_TOTAL', title: 'Goluri pe echipă' }, { type: 'HANDICAP', title: 'Handicap' },
  { type: 'HALF', title: 'Reprize' }, { type: 'CORNERS', title: 'Cornere' }, { type: 'CLEAN_SHEET', title: 'Fără gol primit' }, { type: 'TEAM_SPECIAL', title: 'Speciale' },
];
const shortBook = (b?: string) => (!b ? '' : b.startsWith('The Odds API') ? 'The Odds API' : b.split(' · ')[0]);

/** Every stored market of one match (all lines the sources give), grouped by type, with the price's source. */
export function MatchMarkets({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let on = true; api<Data>(`/api/matches/markets?id=${encodeURIComponent(id)}`).then((d) => { if (on) setData(d); }).catch((e) => { if (on) setError((e as Error).message); }); return () => { on = false; }; }, [id]);
  if (error) return <p className="text-xs text-rose">{error}</p>;
  if (!data) return <p className="animate-pulse text-xs text-muted">Încarc toate pronosticurile…</p>;
  if (!data.markets.length) return <p className="text-xs text-muted">Sursele nu publică încă pronosticuri cu cote pentru acest meci.</p>;
  const sources = [...new Set(data.markets.map((m) => shortBook(m.bookmaker)).filter(Boolean))];
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-muted">{data.markets.length} pronosticuri · surse: {sources.join(', ') || data.bookmaker}{data.observedAt && <> · cote din {new Date(data.observedAt).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</>}</p>
      {GROUPS.map((g) => {
        const ms = data.markets.filter((m) => m.marketType === g.type).sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || a.key.localeCompare(b.key));
        if (!ms.length) return null;
        return (
          <div key={g.type}>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">{g.title} <span className="tabular opacity-60">{ms.length}</span></p>
            <div className="flex flex-wrap gap-1.5">
              {ms.map((m) => (
                <span key={m.key} title={m.bookmaker ?? data.bookmaker ?? ''} className={`whitespace-nowrap rounded-md border px-2 py-1 text-xs ${shortBook(m.bookmaker) === 'The Odds API' ? 'border-cyan/40' : 'border-line'}`}>
                  {m.label} <b className="tabular text-text">{m.odds.toFixed(2)}</b> <span className="text-[10px] text-muted">{shortBook(m.bookmaker)}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
