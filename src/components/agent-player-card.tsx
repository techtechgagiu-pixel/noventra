import { AGENT_META } from '@/lib/format';
import type { AgentStat } from '@/lib/agent-stats';
import { agentProgression } from '@/lib/agent-progression';
import { AgentPredictionHistory } from './agent-prediction-history';

const money = (x: number) => x > 0 && x < .01 ? '< 0,01 $' : `${x.toFixed(2).replace('.', ',')} $`;
const num = (x: number) => new Intl.NumberFormat('ro-RO').format(Math.round(x));

export function AgentPlayerCard({ agent: a, place, monthLabel }: { agent: AgentStat; place: number; monthLabel: string }) {
  const meta = AGENT_META[a.id], p = agentProgression(a.career, a.editorial), decided = a.won + a.lost;
  const rarity = p?.rank.id ?? 'editorial';
  return <article id={`agent-${a.id}`} className="agent-player-card" data-rarity={rarity} aria-label={`Card ${a.name}`}>
    <header className="player-card-face">
      <div className="player-card-topline"><span>{a.editorial ? 'Redacția' : `#${place} în clasament`}</span><span className="player-rarity">{p?.rank.name ?? 'Editorial'}</span></div>
      <div className="player-card-portrait-row">
        <div className="player-card-rating"><strong>{a.editorial ? 'AI' : a.hitRate === null ? '—' : `${Math.round(a.hitRate * 100)}`}<small>{a.hitRate !== null && !a.editorial ? '%' : ''}</small></strong><span>{a.editorial ? 'Context' : 'Reușită'}</span><span>{a.editorial ? 'Fără voturi' : `${a.won} din ${decided} verzi`}</span></div>
        <div className="player-card-portrait">{meta?.img ? <img src={meta.img} alt="" loading="lazy" /> : <span aria-hidden>{a.id === 'scout' ? 'S' : a.name.charAt(0)}</span>}</div>
        <div className="player-card-level">{p ? <><span>Nivel</span><strong>{String(p.level).padStart(2, '0')}</strong><span>{num(p.xp)} XP</span></> : <><span>Rol</span><strong className="player-card-role">{a.id === 'corina' ? 'Știri' : 'Scout'}</strong><span>Editorial</span></>}</div>
      </div>
      <h2>{a.name}</h2>
      <p className="player-card-specialty" title={a.title}>{a.title}</p>
      <p className="player-card-model" title={a.ownModel ?? a.model ?? ''}>{a.ownModel ?? a.model ?? 'Model încă nefolosit'}</p>
    </header>
    <div className="player-card-body">
      {!a.editorial ? <>
        <dl className="player-card-results"><div><dt>Verzi</dt><dd className="text-emerald">{a.won}</dd></div><div><dt>Roșii</dt><dd className="text-rose">{a.lost}</dd></div><div><dt>În așteptare</dt><dd>{a.pending}</dd></div></dl>
        <div className="player-card-xp"><div><span>Nivel {p!.level} → {p!.level + 1}</span><span>{p!.progress}/100 XP</span></div><div className="player-card-xp-track" role="progressbar" aria-label={`Progres nivel ${a.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p!.progress}><span style={{ width: `${p!.progress}%` }} /></div><p>Carieră: <span className="text-emerald">{p!.won} V</span> / <span className="text-rose">{p!.lost} R</span><span>+30 / −15 XP</span></p></div>
      </> : <p className="player-card-editorial">{a.id === 'corina' ? 'Decizie editorială: știri, surse și contradicții; fără voturi.' : 'Cercetare și context; fără pronosticuri proprii.'}</p>}
      <details className="player-card-details"><summary>Detalii și consum</summary><div className="space-y-2 pt-2 text-[11px] text-muted">
        {!a.editorial && <><dl className="grid grid-cols-2 gap-2"><div><dt>Cotă medie (decise)</dt><dd className="font-bold text-text">{a.avgOdds == null ? '—' : a.avgOdds.toFixed(2)}</dd></div><div><dt>Estimare medie (decise)</dt><dd className="font-bold text-text">{a.avgEstimated == null ? '—' : `${Math.round(a.avgEstimated * 100)}%`}</dd></div></dl><p>{a.bets} pronosticuri · {a.voided} anulate · {a.noBet} NO BET</p><p>{a.upcoming} viitoare · {a.live} live · {a.awaiting} așteaptă confirmare</p>{p?.nextRank && <p>Următorul rang, {p.nextRank.name}: minimum {p.nextRank.minimum} rezultate decise și {Math.round(p.nextRank.rate * 100)}% verzi în carieră.</p>}</>}
        {!a.bets && a.usage.failed > 0 && !a.editorial && <p className="text-gold">Niciun pronostic valid salvat. {a.usage.failed} apeluri au eșuat; abținerile nu sunt voturi NO BET.</p>}
        <p>{money(a.usage.costToday)} azi · {money(a.usage.cost7d)} în 7 zile · {money(a.usage.costMonth)} {monthLabel} · {money(a.usage.costTotal)} total</p>
        <p>{num(a.usage.calls)} apeluri · {num(a.usage.inTokens + a.usage.outTokens)} tokeni{a.usage.avgLatencyMs ? ` · ${(a.usage.avgLatencyMs / 1000).toFixed(1)} s/răspuns` : ''}{a.usage.failed ? ` · ${a.usage.failed} eșuate` : ''}</p>
        {a.ownModelShare !== null && <p>{Math.round(a.ownModelShare * 100)}% din pozițiile afișate pe modelul atribuit acum.</p>}
      </div></details>
      {a.recent.length > 0 && <AgentPredictionHistory agent={a.name} entries={a.recent} />}
    </div>
  </article>;
}
