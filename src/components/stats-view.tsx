import { AGENT_META, fmtDateTime } from '@/lib/format';
import type { AgentStat } from '@/lib/agent-stats';
import Link from 'next/link';

const money = (x: number) => (x < 0.01 && x > 0 ? '< 0,01 $' : `${x.toFixed(2).replace('.', ',')} $`);
const num = (x: number) => new Intl.NumberFormat('ro-RO').format(Math.round(x));
const OUT: Record<string, { t: string; c: string }> = { WON: { t: 'verde', c: 'bg-emerald' }, LOST: { t: 'roșu', c: 'bg-rose' }, VOID: { t: 'anulat', c: 'bg-muted' } };

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const monthName = (m: string) => (m === 'all' ? 'de la început' : `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`);
const shift = (m: string, k: number) => { const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + k, 1)); return d.toISOString().slice(0, 7); };

export function StatsView({ agents, totals, month, scope = 'all' }: { agents: AgentStat[]; totals: { today: number; week: number; total: number; calls: number; cap: number }; month: string; scope?: 'all' | 'mine' }) {
  const now = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const choices = [now, shift(now, -1), shift(now, -2), 'all'];
  const sorted = [...agents].sort((a, b) => (b.won + b.lost ? 1 : 0) - (a.won + a.lost ? 1 : 0) || (b.hitRate ?? -1) - (a.hitRate ?? -1) || b.bets - a.bets);
  const used = Math.min(1, totals.cap ? totals.today / totals.cap : 0);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[1.9rem] font-bold leading-tight tracking-tight">Statistici</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Ultima poziție a fiecărui agent pe fiecare meci, fără dublarea analizelor repetate. Luna se referă la data meciului. Scorurile finale actualizează rezultatele; data analizei este afișată separat.</p>
        <nav aria-label="Sfera statisticilor" className="mt-3 flex gap-2"><Link href={`/?tab=statistici&luna=${month}&scope=all`} aria-current={scope === 'all' ? 'page' : undefined} className={`chip ${scope === 'all' ? 'text-cyan' : 'text-muted'}`}>Toată comunitatea</Link><Link href={`/?tab=statistici&luna=${month}&scope=mine`} aria-current={scope === 'mine' ? 'page' : undefined} className={`chip ${scope === 'mine' ? 'text-cyan' : 'text-muted'}`}>Analizele mele</Link></nav>
        <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="Luna">
          {choices.map((c) => <a key={c} href={`/?tab=statistici&luna=${c}&scope=${scope}`} aria-current={c === month ? 'page' : undefined} className={`chip ${c === month ? 'text-cyan' : 'text-muted'}`}>{c === 'all' ? 'De la început' : monthName(c)}</a>)}
        </nav>
      </div>

      <section aria-label="Consum OpenRouter" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[1.2rem] border border-line bg-panel/60 p-4 sm:col-span-2">
          <p className="text-sm text-muted">Consum azi <span className="text-xs">(UTC)</span></p>
          <p className="mt-1 font-display text-3xl font-bold tabular">{money(totals.today)} <span className="text-base font-normal text-muted">din {money(totals.cap)}</span></p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${used > 0.85 ? 'bg-rose' : used > 0.6 ? 'bg-gold' : 'bg-emerald'}`} style={{ width: `${Math.max(2, used * 100)}%` }} /></div>
          <p className="mt-2 text-[11px] text-muted">Peste limită, agenții trec singuri pe modelele gratuite până după miezul nopții UTC.</p>
        </div>
        <div className="rounded-[1.2rem] border border-line bg-panel/60 p-4"><p className="text-sm text-muted">Ultimele 7 zile</p><p className="mt-1 font-display text-3xl font-bold tabular">{money(totals.week)}</p></div>
        <div className="rounded-[1.2rem] border border-line bg-panel/60 p-4"><p className="text-sm text-muted">De la început</p><p className="mt-1 font-display text-3xl font-bold tabular">{money(totals.total)}</p><p className="mt-1 text-[11px] text-muted">{num(totals.calls)} apeluri la modele</p></div>
      </section>
      <p className="-mt-5 text-[11px] text-muted">Costul e calculat din tokenii consumați și prețul listat pe OpenRouter pentru fiecare model; factura exactă o vezi în contul OpenRouter.</p>

      <h2 className="font-display text-xl font-bold">Clasamentul {month === 'all' ? 'de la început' : `lunii ${monthName(month)}`}</h2>
      <section aria-label="Agenții" className="-mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((a, rank) => {
          const m = AGENT_META[a.id];
          const decided = a.won + a.lost;
          return (
            <article key={a.id} className="flex flex-col rounded-[1.4rem] border border-line bg-panel/60 p-4" style={{ borderTopColor: m?.accent, borderTopWidth: 3 }}>
              <header className="flex items-center gap-3">
                {m?.img ? <img src={m.img} alt="" className="h-12 w-12 rounded-full border-2 object-cover" style={{ borderColor: m.accent }} /> : <span className="h-12 w-12 rounded-full bg-panel-2" />}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-lg font-bold leading-tight" style={{ color: m?.accent }}><span className="mr-1.5 text-sm text-muted tabular">{decided ? `${rank + 1}.` : ''}</span>{a.name}</h2>
                  <p className="truncate text-[11px] text-muted">{a.ownModel ?? a.model ?? 'încă nefolosit'}{!a.editorial && a.ownModelShare !== null && a.ownModelShare < 0.995 ? `, ${Math.round(a.ownModelShare * 100)}% din pronosticuri pe el` : ''}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl font-bold tabular">{a.hitRate === null ? '—' : `${Math.round(a.hitRate * 100)}%`}</p>
                  <p className="text-[11px] text-muted">{decided ? `${a.won} din ${decided} verzi` : 'nimic decis încă'}</p>
                </div>
              </header>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                {a.bets > 0 && <><span className="bg-emerald" style={{ width: `${(a.won / a.bets) * 100}%` }} /><span className="bg-rose" style={{ width: `${(a.lost / a.bets) * 100}%` }} /><span className="bg-muted/40" style={{ width: `${((a.pending + a.voided) / a.bets) * 100}%` }} /></>}
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div><dt className="text-muted">Verzi</dt><dd className="font-bold text-emerald tabular">{a.won}</dd></div>
                <div><dt className="text-muted">Roșii</dt><dd className="font-bold text-rose tabular">{a.lost}</dd></div>
                <div><dt className="text-muted">În așteptare</dt><dd className="font-bold tabular">{a.pending}</dd></div>
                <div><dt className="text-muted">NO BET</dt><dd className="font-bold tabular">{a.noBet}</dd></div>
                <div><dt className="text-muted">Cotă medie</dt><dd className="font-bold tabular">{a.avgOdds ? a.avgOdds.toFixed(2) : '—'}</dd></div>
                <div><dt className="text-muted">Estimare medie</dt><dd className="font-bold tabular">{a.avgEstimated ? `${Math.round(a.avgEstimated * 100)}%` : '—'}</dd></div>
              </dl>
              {!a.editorial && <p className="mt-2 text-[11px] text-muted">{a.upcoming} viitoare · {a.live} live · {a.awaiting} așteaptă confirmare</p>}
              {a.editorial && <p className="mt-2 text-xs text-muted">{a.id === 'corina' ? 'Decizie editorială: selectează și prioritizează știrile, citează sursele și semnalează contradicțiile; fără voturi.' : 'Cercetare și context; fără pronosticuri proprii.'}</p>}
              {!a.bets && a.usage.failed > 0 && !a.editorial && <p className="mt-2 text-xs text-gold">Niciun pronostic valid salvat. {a.usage.failed} apeluri au eșuat; abținerile nu sunt voturi NO BET.</p>}
              <div className="mt-3 rounded-xl border border-line bg-ink/40 px-3 py-2 text-xs text-muted">
                <p><span className="text-text tabular">{money(a.usage.costToday)}</span> azi, <span className="text-text tabular">{money(a.usage.cost7d)}</span> în 7 zile, <span className="text-text tabular">{money(a.usage.costMonth)}</span> luna aceasta, <span className="text-text tabular">{money(a.usage.costTotal)}</span> total</p>
                <p className="mt-0.5">{num(a.usage.calls)} apeluri, {num(a.usage.inTokens + a.usage.outTokens)} tokeni{a.usage.avgLatencyMs ? `, ${(a.usage.avgLatencyMs / 1000).toFixed(1)} s pe răspuns` : ''}{a.usage.calls ? `, ${Math.round((a.usage.fallback / a.usage.calls) * 100)}% pe rezervă` : ''}{a.usage.failed ? `, ${a.usage.failed} eșuate` : ''}</p>
              </div>
              {a.recent.length > 0 && (
                <details className="group mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-cyan">Ultimele pronosticuri</summary>
                  <ul className="mt-2 space-y-1.5">
                    {a.recent.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${OUT[r.outcome ?? '']?.c ?? 'border border-muted'}`} title={OUT[r.outcome ?? '']?.t ?? 'în așteptare'} />
                        <span className="min-w-0 flex-1"><span className="text-text">{r.match}{r.score ? ` (${r.score})` : ''}</span><span className="block text-muted">{r.league} · Meci: {fmtDateTime(r.kickoff)}</span><span className="block text-muted">{r.label}{r.odds ? ` @ ${r.odds.toFixed(2)}` : ''}</span><span className="block text-muted">Analizat: {fmtDateTime(r.at)} · <Link href={`/?tab=analiza&job=${r.jobId}`} className="text-cyan">jurnal</Link>{r.fixtureId.startsWith('espn:') && <> · <a className="text-cyan" href={`https://www.espn.com/soccer/match/_/gameId/${r.fixtureId.slice(5)}`} target="_blank" rel="noreferrer">sursa meciului</a></>}</span></span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
