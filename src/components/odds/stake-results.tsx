'use client';
import { useState } from 'react';

type Pending = { id: string; home: string; away: string; league: string; kickoff: string; legs: number; live: { home: number; away: number; clock: string | null } | null };
const when = (iso: string) => new Date(iso).toLocaleString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' });

/** Owner: final scores of Stake-only matches (no automatic source). Settlement picks them up within minutes. */
export function StakeResults({ initial }: { initial: Pending[] }) {
  const [list, setList] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  async function save(p: Pending, form: HTMLFormElement, cancelled = false) {
    const d = new FormData(form);
    const res = await fetch('/api/stake-results', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cancelled ? { fixtureId: p.id, cancelled: true } : { fixtureId: p.id, home: d.get('home'), away: d.get('away'), htHome: d.get('htHome'), htAway: d.get('htAway') }) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (!res?.ok) { setMsg(`${p.home} – ${p.away}: ${body?.error ?? 'nu s-a putut salva'}`); return; }
    setList((l) => l.filter((x) => x.id !== p.id));
    setMsg(`${p.home} – ${p.away}: ${cancelled ? 'marcat anulat' : `${d.get('home')}–${d.get('away')} salvat`}. Biletele se actualizează în câteva minute.`);
  }
  return <section className="card p-5" aria-labelledby="stake-results-title">
    <h2 id="stake-results-title" className="font-display text-lg font-bold">Rezultate de introdus</h2>
    <p className="mt-1 text-sm text-muted">Meciurile doar-Stake (fără program ESPN) nu au rezultat automat. Scrie scorul final ca selecțiile să primească verdict; scorul la pauză e opțional.</p>
    {msg && <p role="status" className="mt-3 text-sm text-cyan">{msg}</p>}
    {!list.length ? <p className="mt-3 text-sm text-muted">Nimic de introdus acum.</p> : <ul className="mt-3 space-y-2">
      {list.map((p) => <li key={p.id} className="rounded-xl border border-line p-3">
        <form onSubmit={(e) => { e.preventDefault(); void save(p, e.currentTarget); }} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 flex-1"><strong>{p.home} – {p.away}</strong><span className="block text-xs text-muted">{p.league} · {when(p.kickoff)}{p.legs ? ` · pe ${p.legs} ${p.legs === 1 ? 'bilet' : 'bilete'}` : ''}</span>{p.live && <span className="block text-xs text-cyan">Ultimul scor live: {p.live.home}–{p.live.away}{p.live.clock ? ` (${p.live.clock})` : ''}. Verifică și apasă Salvează.</span>}</span>
          <label className="sr-only" htmlFor={`h-${p.id}`}>Goluri {p.home}</label><input id={`h-${p.id}`} name="home" defaultValue={p.live?.home} inputMode="numeric" required pattern="[0-9]{1,2}" className="w-12 rounded-lg border border-line bg-ink px-2 py-1.5 text-center" placeholder="0" />
          <span>–</span>
          <label className="sr-only" htmlFor={`a-${p.id}`}>Goluri {p.away}</label><input id={`a-${p.id}`} name="away" defaultValue={p.live?.away} inputMode="numeric" required pattern="[0-9]{1,2}" className="w-12 rounded-lg border border-line bg-ink px-2 py-1.5 text-center" placeholder="0" />
          <span className="text-xs text-muted">pauză</span>
          <input name="htHome" aria-label={`Pauză ${p.home}`} inputMode="numeric" pattern="[0-9]{1,2}" className="w-10 rounded-lg border border-line bg-ink px-1 py-1.5 text-center text-xs" />
          <input name="htAway" aria-label={`Pauză ${p.away}`} inputMode="numeric" pattern="[0-9]{1,2}" className="w-10 rounded-lg border border-line bg-ink px-1 py-1.5 text-center text-xs" />
          <button className="chip text-cyan">Salvează</button>
          <button type="button" onClick={(e) => void save(p, e.currentTarget.form!, true)} className="chip text-muted">Anulat</button>
        </form>
      </li>)}
    </ul>}
  </section>;
}
