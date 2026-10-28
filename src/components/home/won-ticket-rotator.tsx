'use client';
import { useEffect, useMemo, useState } from 'react';
import type { WonTicket } from '@/lib/public-proof';

const odds = (n: number) => n.toFixed(2);
const day = (iso: string) => new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', timeZone: 'Europe/Bucharest' }).format(new Date(iso));
const ROTATE_MS = 6500;

/**
 * Recent real wins, one at a time, in random order (owner request 28.10). Pauses while hovered or focused; the dots
 * pick one by hand. The first render is the most recent win, so server and browser agree before shuffling.
 */
export function WonTicketRotator({ wins }: { wins: WonTicket[] }) {
  const [order, setOrder] = useState<number[]>(() => wins.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const o = wins.map((_, i) => i);
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    setOrder(o); setPos(0);
  }, [wins]);
  useEffect(() => {
    if (paused || wins.length < 2) return;
    const t = setInterval(() => setPos((p) => (p + 1) % wins.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, wins.length]);
  const won = useMemo(() => wins[order[pos] ?? 0], [wins, order, pos]);
  if (!won) return null;
  return <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <div key={`${order[pos]}`} className="slip won-rotate" data-result="WON" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div><p id="proof-title" className="public-proof-kicker">Bilet câștigat</p><p className="mt-1 text-xs text-muted">închis pe {day(won.settledAt)} · {won.legs.length} {won.legs.length === 1 ? 'meci' : 'meciuri'}</p></div>
        <div className="text-right"><p className="board-num text-[2.6rem]">{odds(won.odds)}</p><p className="mt-1 text-xs text-muted">cota totală</p></div>
      </div>
      <ul className="public-proof-legs">{won.legs.map((l, i) => <li key={i}>
        <div className="min-w-0"><p className="truncate font-semibold">{l.home} – {l.away}</p><p className="truncate text-xs text-muted">{l.label}</p></div>
        <div className="shrink-0 text-right"><p className="font-display text-lg font-bold">{l.homeScore != null && l.awayScore != null ? `${l.homeScore}-${l.awayScore}` : '—'}</p><p className="text-xs text-emerald">✓ {odds(l.odds)}</p></div>
      </li>)}</ul>
    </div>
    {wins.length > 1 && <div className="won-dots" role="group" aria-label="Alege un bilet câștigat">
      {order.map((idx, k) => <button key={idx} type="button" aria-label={`Biletul câștigat ${k + 1} din ${wins.length}`} aria-pressed={k === pos} onClick={() => setPos(k)} />)}
    </div>}
  </div>;
}
