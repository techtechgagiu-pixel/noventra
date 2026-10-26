'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2, Search, Send, Trash2, X } from 'lucide-react';
import { AGENT_META, api, fmtDateTime } from '@/lib/format';

type Market = { key: string; label: string; type?: string; marketType?: string; odds: number };
type Fx = { id: string; league: string; country: string; home: string; away: string; homeLogo?: string; awayLogo?: string; kickoff: string; status: string; odds: { markets: Market[] } | null };
type Leg = { fixtureId: string; marketKey: string; label: string; odds: number; match: string; kickoff: string };

const BANNED = /:UNDER(:|$)/;
const GROUP: Record<string, string> = { '1X2': 'Rezultat final', DOUBLE_CHANCE: 'Șansă dublă', TOTAL: 'Total goluri', BTTS: 'Ambele marchează', TEAM_TOTAL: 'Goluri pe echipă', HANDICAP: 'Handicap', CLEAN_SHEET: 'Fără gol primit', TEAM_SPECIAL: 'Speciale echipă', HALF: 'Reprize', CORNERS: 'Cornere' };
const QUICK = (m: Market) => /^(1X2:|DC:|TOTAL:OVER:(1\.5|2\.5)$|BTTS:YES$)/.test(m.key);
const STORE = 'primul11:review-slip';
const read = (): Leg[] => { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; } };
const write = (l: Leg[]) => { try { localStorage.setItem(STORE, JSON.stringify(l)); } catch { /* storage unavailable */ } };

/** "Vino cu biletul tău la analiză": build a ticket from real prices, add tips for the tacticians, send it to the 12 agents. */
export function ReviewBuilder() {
  const router = useRouter();
  const [fixtures, setFixtures] = useState<Fx[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [league, setLeague] = useState<string | null>(null);
  const [when, setWhen] = useState<'all' | 'today' | 'tomorrow'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [extra, setExtra] = useState<Record<string, Market[] | 'loading' | 'error'>>({});
  const [slip, setSlip] = useState<Leg[]>([]);
  const [advice, setAdvice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);

  useEffect(() => { setSlip(read()); }, []);
  useEffect(() => {
    api<{ fixtures: Fx[] }>('/api/fixtures?days=3&pool=all')
      .then((r) => setFixtures(r.fixtures.filter((f) => f.status === 'pre' && f.odds && Date.parse(f.kickoff) > Date.now() + 25 * 60_000).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))))
      .catch((e) => setLoadError((e as Error).message));
  }, []);

  const update = (l: Leg[]) => { setSlip(l); write(l); };
  const toggle = (f: Fx, m: Market) => {
    const cur = slip.find((x) => x.fixtureId === f.id);
    if (cur?.marketKey === m.key) return update(slip.filter((x) => x.fixtureId !== f.id));
    if (!cur && slip.length >= 15) { setError('Maximum 15 meciuri pe bilet.'); return; }
    const leg: Leg = { fixtureId: f.id, marketKey: m.key, label: m.label, odds: m.odds, match: `${f.home} – ${f.away}`, kickoff: f.kickoff };
    update(cur ? slip.map((x) => (x.fixtureId === f.id ? leg : x)) : [...slip, leg]);
    setError(null);
  };
  async function more(id: string) {
    if (extra[id] && extra[id] !== 'error') return;
    setExtra((e) => ({ ...e, [id]: 'loading' }));
    try { const r = await api<{ markets: Market[] }>(`/api/fixtures/${id}/markets`); setExtra((e) => ({ ...e, [id]: r.markets })); }
    catch { setExtra((e) => ({ ...e, [id]: 'error' })); }
  }
  async function send() {
    setBusy(true); setError(null);
    try {
      const r = await api<{ jobId: string }>('/api/review-tickets', { method: 'POST', body: JSON.stringify({ legs: slip.map((l) => ({ fixtureId: l.fixtureId, marketKey: l.marketKey })), advice }) });
      update([]);
      router.push(`/?tab=verifica&job=${r.jobId}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const total = slip.reduce((p, l) => p * l.odds, 1);
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' });
  const today = dayKey(new Date().toISOString());
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000).toISOString());
  const leagueOf = (f: Fx) => `${f.country} · ${f.league}`;
  // Leagues with their number of matches (after the day filter), most matches first.
  const leagues = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fixtures ?? []) { const d = dayKey(f.kickoff); if (when === 'today' && d !== today) continue; if (when === 'tomorrow' && d !== tomorrow) continue; m.set(leagueOf(f), (m.get(leagueOf(f)) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [fixtures, when, today, tomorrow]);
  const shown = useMemo(() => {
    if (!fixtures) return [];
    const s = q.trim().toLowerCase();
    return fixtures.filter((f) => {
      const d = dayKey(f.kickoff);
      if (when === 'today' && d !== today) return false;
      if (when === 'tomorrow' && d !== tomorrow) return false;
      if (league && leagueOf(f) !== league) return false;
      return !s || `${f.home} ${f.away} ${f.league} ${f.country}`.toLowerCase().includes(s);
    }).slice(0, 150);
  }, [fixtures, q, league, when, today, tomorrow]);
  // Grouped by league (leagues in order of their first kick-off).
  const days = useMemo(() => {
    const out: Array<{ day: string; items: Fx[] }> = [];
    const by = new Map<string, Fx[]>();
    for (const f of shown) { const k = leagueOf(f); (by.get(k) ?? by.set(k, []).get(k)!).push(f); }
    for (const [k, items] of by) out.push({ day: `${k} (${items.length})`, items });
    return out;
  }, [shown]);

  const slipPanel = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">Biletul tău</h3>
        {slip.length > 0 && <button onClick={() => update([])} className="flex items-center gap-1 text-xs text-muted hover:text-rose"><Trash2 size={13} aria-hidden /> Golește</button>}
      </div>
      {!slip.length ? <p className="text-sm text-muted">Alege pronosticuri din lista de meciuri — câte unul pe meci, maximum 15.</p> : (
        <ol className="space-y-2">
          {slip.map((l, i) => (
            <li key={l.fixtureId} className="card-soft flex items-start gap-2 p-2.5">
              <span className="mt-0.5 text-xs font-bold text-muted tabular">{i + 1}.</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{l.match}</p><p className="truncate text-xs text-cyan">{l.label}</p><p className="text-[11px] text-muted">{fmtDateTime(l.kickoff)}</p></div>
              <span className="font-display font-bold tabular">{l.odds.toFixed(2)}</span>
              <button onClick={() => update(slip.filter((x) => x.fixtureId !== l.fixtureId))} aria-label={`Scoate ${l.match}`} className="text-muted hover:text-rose"><X size={15} /></button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex items-baseline justify-between border-t border-line pt-3"><span className="text-sm text-muted">Cotă totală</span><span className="font-display text-3xl font-bold text-emerald tabular">{slip.length ? total.toFixed(2) : '—'}</span></div>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Sfaturi pentru tacticieni (opțional)</span>
        <textarea value={advice} onChange={(e) => setAdvice(e.target.value.slice(0, 800))} rows={3} placeholder="Ex.: cred că gazdele sunt în formă după schimbarea antrenorului; la meciul 2 mă tem de oboseală după cupe…"
          className="mt-1.5 w-full resize-y rounded-xl border border-line bg-ink px-3 py-2 text-sm text-text outline-none placeholder:text-muted/60 focus:border-cyan" />
        <span className="text-[11px] text-muted">Agenții le iau în calcul doar dacă datele le susțin. {advice.length}/800</span>
      </label>
      {error && <p className="text-sm text-rose" role="alert">{error}</p>}
      <button onClick={send} disabled={busy || !slip.length} className="btn btn-primary w-full px-6 py-3 disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} aria-hidden />} {busy ? 'Verific cotele…' : 'TRIMITE LA ANALIZĂ'}</button>
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <div className="flex -space-x-2">{['victor', 'andrei', 'alex', 'robert', 'becali'].map((a) => <img key={a} src={AGENT_META[a]?.img} alt="" className="h-6 w-6 rounded-full border-2 border-ink object-cover" />)}</div>
        <span>Agenții echipei îl analizează meci cu meci; GPT-6 Luna Pro îți dă verdictul și sfaturile.</span>
      </div>
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <section aria-label="Meciuri disponibile" className="min-w-0 space-y-3">
        <label className="card flex items-center gap-2 px-3 py-2.5">
          <Search size={16} className="text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută echipă sau campionat…" aria-label="Caută meci" className="w-full bg-transparent text-sm outline-none placeholder:text-muted/70" />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ziua">
          {([['all', 'Toate zilele'], ['today', 'Azi'], ['tomorrow', 'Mâine']] as const).map(([k, l]) => <button key={k} onClick={() => { setWhen(k); setLeague(null); }} aria-pressed={when === k} className={`chip ${when === k ? 'text-cyan' : 'text-muted'}`}>{l}</button>)}
        </div>
        {leagues.length > 0 && (
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1" role="group" aria-label="Campionatul">
            <button onClick={() => setLeague(null)} aria-pressed={!league} className={`chip ${!league ? 'text-cyan' : 'text-muted'}`}>Toate campionatele</button>
            {leagues.map(([k, n]) => <button key={k} onClick={() => setLeague(league === k ? null : k)} aria-pressed={league === k} className={`chip ${league === k ? 'text-cyan' : 'text-muted'}`}>{k} <span className="opacity-60">{n}</span></button>)}
          </div>
        )}
        {!fixtures && !loadError && <p className="card flex items-center gap-2 p-6 text-sm text-muted"><Loader2 size={16} className="animate-spin" aria-hidden /> Încarc meciurile cu cote reale…</p>}
        {loadError && <p className="card p-6 text-sm text-rose">{loadError}</p>}
        {fixtures && !shown.length && <p className="card p-6 text-sm text-muted">Niciun meci găsit.</p>}
        {days.map((d) => (
          <div key={d.day} className="space-y-2">
            <h4 className="sticky top-[60px] z-10 -mx-1 bg-ink/90 px-1 py-1.5 text-sm font-semibold text-text backdrop-blur">{d.day}</h4>
            {d.items.map((f) => {
              const picked = slip.find((x) => x.fixtureId === f.id);
              const base = (f.odds?.markets ?? []).filter((m) => !BANNED.test(m.key));
              const ext = extra[f.id];
              const list = Array.isArray(ext) ? ext : base;
              const isOpen = open === f.id;
              const groups = isOpen ? Object.entries(list.reduce<Record<string, Market[]>>((g, m) => { const t = m.type ?? m.marketType ?? 'ALTELE'; (g[t] ??= []).push(m); return g; }, {})) : [];
              return (
                <article key={f.id} className={`card p-3 ${picked ? 'border-cyan/60' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-muted">{fmtDateTime(f.kickoff)}</p>
                      <p className="truncate font-semibold">{f.home} <span className="text-muted">–</span> {f.away}</p>
                    </div>
                    <button onClick={() => { setOpen(isOpen ? null : f.id); if (!isOpen) void more(f.id); }} aria-expanded={isOpen} className="btn btn-ghost shrink-0 px-2.5 py-1.5 text-xs">Toate piețele <ChevronDown size={14} className={`transition ${isOpen ? 'rotate-180' : ''}`} aria-hidden /></button>
                  </div>
                  {!isOpen && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {base.filter(QUICK).slice(0, 8).map((m) => <Pick key={m.key} m={m} on={picked?.marketKey === m.key} onClick={() => toggle(f, m)} />)}
                      {picked && !base.filter(QUICK).some((m) => m.key === picked.marketKey) && <span className="rounded-lg border border-cyan/60 bg-cyan/15 px-2 py-1 text-xs font-semibold text-cyan">{picked.label} · {picked.odds.toFixed(2)}</span>}
                    </div>
                  )}
                  {isOpen && (
                    <div className="mt-3 space-y-3">
                      {ext === 'loading' && <p className="flex items-center gap-2 text-xs text-muted"><Loader2 size={13} className="animate-spin" aria-hidden /> Încarc toate piețele (Bet365 / DraftKings)…</p>}
                      {ext === 'error' && <p className="text-xs text-gold">Piețele suplimentare nu au putut fi încărcate acum; vezi mai jos piețele principale.</p>}
                      {groups.map(([t, ms]) => (
                        <div key={t}>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{GROUP[t] ?? t}</p>
                          <div className="flex flex-wrap gap-1.5">{ms.map((m) => <Pick key={m.key} m={m} on={picked?.marketKey === m.key} onClick={() => toggle(f, m)} />)}</div>
                        </div>
                      ))}
                      <p className="text-[11px] text-muted">Pronosticurile „sub” nu sunt disponibile în PRIMUL 11.</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ))}
      </section>
      <aside className="hidden lg:block"><div className="card sticky top-20 p-4">{slipPanel}</div></aside>
      {/* Phone: the slip lives in a bottom sheet */}
      <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
        {slipOpen && <div className="max-h-[78vh] overflow-y-auto rounded-t-3xl border-t border-line p-4 pb-24 shadow-2xl" style={{ background: 'rgba(10,18,40,0.98)' }}>{slipPanel}</div>}
        <button onClick={() => setSlipOpen((o) => !o)} className="flex w-full items-center justify-between border-t border-line px-5 py-3.5 text-left" style={{ background: 'rgba(6,11,24,0.97)' }} aria-expanded={slipOpen}>
          <span className="text-sm"><strong className="text-text">{slip.length}</strong> <span className="text-muted">{slip.length === 1 ? 'meci' : 'meciuri'} pe bilet</span></span>
          <span className="flex items-center gap-2"><span className="font-display text-xl font-bold text-emerald tabular">{slip.length ? total.toFixed(2) : '—'}</span><ChevronDown size={16} className={`transition ${slipOpen ? '' : 'rotate-180'}`} aria-hidden /></span>
        </button>
      </div>
    </div>
  );
}

function Pick({ m, on, onClick }: { m: Market; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition ${on ? 'border-cyan bg-cyan/20 text-cyan' : 'border-line bg-ink/40 text-text hover:border-cyan/50'}`}>
      <span className="max-w-[180px] truncate">{m.label}</span><span className="font-bold tabular">{m.odds.toFixed(2)}</span>
    </button>
  );
}
