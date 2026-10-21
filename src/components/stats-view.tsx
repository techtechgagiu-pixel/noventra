import { AGENT_META, fmtDateTime } from '@/lib/format';
import type { AgentStat } from '@/lib/agent-stats';

const money = (x: number) => (x < 0.01 && x > 0 ? '< 0,01 $' : `${x.toFixed(2).replace('.', ',')} $`);
const num = (x: number) => new Intl.NumberFormat('ro-RO').format(Math.round(x));
const OUT: Record<string, { t: string; c: string }> = { WON: { t: 'verde', c: 'bg-emerald' }, LOST: { t: 'roșu', c: 'bg-rose' }, VOID: { t: 'anulat', c: 'bg-muted' } };

export function StatsView({ agents, totals }: { agents: AgentStat[]; totals: { today: number; week: number; total: number; calls: number; cap: number } }) {
  const sorted = [...agents].sort((a, b) => (b.won + b.lost ? 1 : 0) - (a.won + a.lost ? 1 : 0) || (b.hitRate ?? -1) - (a.hitRate ?? -1) || b.bets - a.bets);
  const used = Math.min(1, totals.cap ? totals.today / totals.cap : 0);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[1.9rem] font-bold leading-tight tracking-tight">Statistici</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">Pronosticul final al fiecărui agent pe fiecare meci, verificat după fluier, și cât a consumat fiecare.</p>
      </div>

      <section aria-label="Consum OpenRouter" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[1.2rem] border border-line bg-panel/60 p-4 sm:col-span-2">
          <p className="text-sm text-muted">Consum azi</p>
          <p className="mt-1 font-display text-3xl font-bold tabular">{money(totals.today)} <span className="text-base font-normal text-muted">din {money(totals.cap)}</span></p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${used > 0.85 ? 'bg-rose' : used > 0.6 ? 'bg-gold' : 'bg-emerald'}`} style={{ width: `${Math.max(2, used * 100)}%` }} /></div>
          <p className="mt-2 text-[11px] text-muted">Peste limită, agenții trec singuri pe modelele gratuite până după miezul nopții UTC.</p>
        </div>
        <div className="rounded-[1.2rem] border border-line bg-panel/60 p-4"><p className="text-sm text-muted">Ultimele 7 zile</p><p className="mt-1 font-display text-3xl font-bold tabular">{money(totals.week)}</p></div>
        <div className="rounded-[1.2rem] border border-line bg-panel/60 p-4"><p className="text-sm text-muted">De la început</p><p className="mt-1 font-display text-3xl font-bold tabular">{money(totals.total)}</p><p className="mt-1 text-[11px] text-muted">{num(totals.calls)} apeluri la modele</p></div>
      </section>
      <p className="-mt-5 text-[11px] text-muted">Costul e calculat din tokenii consumați și prețul listat pe OpenRouter pentru fiecare model; factura exactă o vezi în contul OpenRouter.</p>

      <section aria-label="Agenții" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((a) => {
          const m = AGENT_META[a.id];
          const decided = a.won + a.lost;
          return (
            <article key={a.id} className="flex flex-col rounded-[1.4rem] border border-line bg-panel/60 p-4" style={{ borderTopColor: m?.accent, borderTopWidth: 3 }}>
              <header className="flex items-center gap-3">
                {m?.img ? <img src={m.img} alt="" className="h-12 w-12 rounded-full border-2 object-cover" style={{ borderColor: m.accent }} /> : <span className="h-12 w-12 rounded-full bg-panel-2" />}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-lg font-bold leading-tight" style={{ color: m?.accent }}>{a.name}</h2>
                  <p className="truncate text-[11px] text-muted">{a.model ?? 'încă nefolosit'}</p>
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
                <div><dt className="text-muted">Se joacă</dt><dd className="font-bold tabular">{a.pending}</dd></div>
                <div><dt className="text-muted">NO BET</dt><dd className="font-bold tabular">{a.noBet}</dd></div>
                <div><dt className="text-muted">Cotă medie</dt><dd className="font-bold tabular">{a.avgOdds ? a.avgOdds.toFixed(2) : '—'}</dd></div>
                <div><dt className="text-muted">Estimare medie</dt><dd className="font-bold tabular">{a.avgEstimated ? `${Math.round(a.avgEstimated * 100)}%` : '—'}</dd></div>
              </dl>
              <div className="mt-3 rounded-xl border border-line bg-ink/40 px-3 py-2 text-xs text-muted">
                <p><span className="text-text tabular">{money(a.usage.costToday)}</span> azi, <span className="text-text tabular">{money(a.usage.cost7d)}</span> în 7 zile, <span className="text-text tabular">{money(a.usage.costTotal)}</span> total</p>
                <p className="mt-0.5">{num(a.usage.calls)} apeluri, {num(a.usage.inTokens + a.usage.outTokens)} tokeni{a.usage.avgLatencyMs ? `, ${(a.usage.avgLatencyMs / 1000).toFixed(1)} s pe răspuns` : ''}{a.usage.calls ? `, ${Math.round((a.usage.fallback / a.usage.calls) * 100)}% pe rezervă` : ''}{a.usage.failed ? `, ${a.usage.failed} eșuate` : ''}</p>
              </div>
              {a.recent.length > 0 && (
                <details className="group mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-cyan">Ultimele pronosticuri</summary>
                  <ul className="mt-2 space-y-1.5">
                    {a.recent.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${OUT[r.outcome ?? '']?.c ?? 'border border-muted'}`} title={OUT[r.outcome ?? '']?.t ?? 'se joacă'} />
                        <span className="min-w-0 flex-1"><span className="text-text">{r.match}</span><span className="block text-muted">{r.label}{r.odds ? ` @ ${r.odds.toFixed(2)}` : ''} · {fmtDateTime(r.at)}</span></span>
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
