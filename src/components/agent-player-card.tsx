import type { AgentStat } from '@/lib/agent-stats';
import { agentProgression } from '@/lib/agent-progression';
import { AgentPredictionHistory } from './agent-prediction-history';
import { aiCardIdentity } from '@/lib/ai-card-identity';
import { createHash } from 'node:crypto';

const money = (x: number) => x > 0 && x < .01 ? '< 0,01 $' : `${x.toFixed(2).replace('.', ',')} $`;
/** "Hot streak": every voting agent over 80% green picks (user decision 27.10: all of them, no minimum sample). */
export const HOT_MIN_DECIDED = 1;
export const isHot = (a: Pick<AgentStat, 'editorial' | 'won' | 'lost'>) => !a.editorial && a.won + a.lost >= HOT_MIN_DECIDED && a.won / (a.won + a.lost) > 0.8;
const num = (x: number) => new Intl.NumberFormat('ro-RO').format(Math.round(x));

export function AgentPlayerCard({ agent: a, place, monthLabel, historyScope }: { agent: AgentStat; place: number; monthLabel: string; historyScope?: { month: string; scope: 'all' | 'mine'; sport?: 'football' | 'cs' } }) {
  const p = agentProgression(a.career, a.editorial), decided = a.won + a.lost;
  const rarity = p?.rank.id ?? 'editorial';
  const ai = aiCardIdentity(a);
  const portrait = ai.portrait;
  const displayName = ai.modelName;
  const hot = isHot(a);
  return <article id={`agent-${a.id}`} className="agent-player-card player-card-ai" data-agent-id={a.id} data-rarity={rarity} data-hot={hot ? 'true' : undefined} aria-label={`Card AI ${displayName} · ${ai.role}${hot ? ' · hot streak' : ''}`}>
    {hot && <><span className="player-card-flames" aria-hidden /><span className="player-card-hot" title={`Peste 80% reușită: ${a.won} din ${decided} verzi`}>🔥 HOT STREAK</span></>}
    <header className="player-card-face">
      <div className="player-card-topline"><span>{a.editorial ? 'Redacția' : `#${place} în clasament`}</span><span className="player-rarity">{p?.rank.name ?? 'Editorial'}</span></div>
      <div className="player-card-portrait-row">
        <div className="player-card-rating"><strong>{a.editorial ? 'AI' : a.hitRate === null ? '—' : `${Math.round(a.hitRate * 100)}`}<small>{a.hitRate !== null && !a.editorial ? '%' : ''}</small></strong><span>{a.editorial ? 'Context' : 'Reușită'}</span><span>{a.editorial ? 'Fără voturi' : `${a.won} din ${decided} verzi`}</span></div>
        <div className="player-card-portrait">{portrait ? <img src={portrait} alt={`Avatar AI ilustrativ pentru ${displayName}`} loading="lazy" /> : <span aria-hidden>{a.id === 'scout' ? 'S' : a.name.charAt(0)}</span>}</div>
        <div className="player-card-level">{p ? <><span>Nivel</span><strong>{String(p.level).padStart(2, '0')}</strong><span>{num(p.xp)} XP</span></> : <><span>Rol</span><strong className="player-card-role">{a.id === 'corina' ? 'Știri' : 'Scout'}</strong><span>Editorial</span></>}</div>
      </div>
      {ai && <p className="player-ai-provider">{ai.company}</p>}
      <h2 title={displayName}>{displayName}</h2>
      <p className="player-card-specialty" title={a.title}>{ai.role}</p>
      {a.coaching && <p className="player-card-coaching" title={`Sub media echipei: ${Math.round(a.coaching.hitRate * 100)}% față de ${Math.round(a.coaching.teamRate * 100)}% pe ultimele ${a.coaching.n} pronosticuri`}>🎯 În antrenament{a.coaching.level === 2 ? ' strict' : ''}</p>}

    </header>
    <div className="player-card-body">
      {!a.editorial ? <>
        <dl className="player-card-results"><div><dt>Verzi</dt><dd className="text-emerald">{a.won}</dd></div><div><dt>Roșii</dt><dd className="text-rose">{a.lost}</dd></div><div><dt>În așteptare</dt><dd>{a.pending}</dd></div></dl>
        <div className="player-card-xp"><div><span>Nivel {p!.level} → {p!.level + 1}</span><span>{p!.progress}/100 XP</span></div><div className="player-card-xp-track" role="progressbar" aria-label={`Progres nivel ${displayName} · ${ai.role}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p!.progress}><span style={{ width: `${p!.progress}%` }} /></div><p>{historyScope?.month === 'all' ? 'Carieră: ' : `În ${monthLabel} (se resetează pe 1): `}<span className="text-emerald">{p!.won} V</span> / <span className="text-rose">{p!.lost} R</span><span>+30 / −15 XP</span></p></div>
      </> : <p className="player-card-editorial">{a.id === 'corina' ? 'Decizie editorială: știri, surse și contradicții; fără voturi.' : 'Cercetare și context; fără pronosticuri proprii.'}</p>}
      <details className="player-card-details"><summary>Detalii și consum</summary><div className="space-y-2 pt-2 text-[11px] text-muted">
      {ai && a.character && <div className="player-ai-character">
        <p>{a.character.specialty}</p>
        {!a.editorial && <dl><div><dt>Risc</dt><dd>{a.character.risk}/100</dd></div><div><dt>Cotă max.</dt><dd>{a.character.maxOdds.toFixed(2)}</dd></div><div><dt>Prob. min.</dt><dd>{Math.round(a.character.minProbability * 100)}%</dd></div></dl>}
        {a.coaching && <p className="text-gold">În antrenament: pe ultimele {a.coaching.n} pronosticuri are {Math.round(a.coaching.hitRate * 100)}%, echipa {Math.round(a.coaching.teamRate * 100)}%. Joacă acum cu cotă max. {a.coaching.maxOdds.toFixed(2)} și prob. min. {Math.round(a.coaching.minProbability * 100)}%{a.coaching.blocked.length ? `; nu mai poate vota: ${a.coaching.blocked.map((b) => `${b.label} (${b.won}/${b.n})`).join(', ')}` : ''}. Limitele se relaxează singure când revine la nivelul echipei.</p>}
      </div>}
        {ai && <p className="break-all">Model atribuit: {ai.modelId ?? 'neatribuit'}</p>}
        {!a.editorial && <><dl className="grid grid-cols-2 gap-2"><div><dt>Cotă medie (decise)</dt><dd className="font-bold text-text">{a.avgOdds == null ? '—' : a.avgOdds.toFixed(2)}</dd></div><div><dt>Estimare medie (decise)</dt><dd className="font-bold text-text">{a.avgEstimated == null ? '—' : `${Math.round(a.avgEstimated * 100)}%`}</dd></div></dl><p>{a.bets} pronosticuri · {a.voided} anulate · {a.noBet} NO BET</p><p>{a.upcoming} viitoare · {a.live} live · {a.awaiting} așteaptă confirmare</p>{p?.nextRank && <p>Următorul rang, {p.nextRank.name}: minimum {p.nextRank.minimum} rezultate decise și {p.nextRank.strict ? 'peste ' : 'minimum '}{Math.round(p.nextRank.rate * 100)}% verzi în carieră.</p>}</>}
        {!a.bets && a.usage.failed > 0 && !a.editorial && <p className="text-gold">Niciun pronostic valid salvat. {a.usage.failed} apeluri au eșuat; abținerile nu sunt voturi NO BET.</p>}
        <p>{money(a.usage.costToday)} azi · {money(a.usage.cost7d)} în 7 zile · {money(a.usage.costMonth)} {monthLabel} · {money(a.usage.costTotal)} total</p>
        <p>{num(a.usage.calls)} apeluri · {num(a.usage.inTokens + a.usage.outTokens)} tokeni{a.usage.avgLatencyMs ? ` · ${(a.usage.avgLatencyMs / 1000).toFixed(1)} s/răspuns` : ''}{a.usage.failed ? ` · ${a.usage.failed} eșuate` : ''}</p>
        {a.ownModelShare !== null && <p>{Math.round(a.ownModelShare * 100)}% din pozițiile acestui rol au fost date de modelul atribuit acum.</p>}
        {!a.editorial && a.excluded && a.excluded.won + a.excluded.lost > 0 && <p>Necontabilizate: {a.excluded.won} V / {a.excluded.lost} R{a.excluded.otherModel ? ` · ${a.excluded.otherModel} de la alt model (rezervă sau atribuire veche)` : ''}{a.excluded.afterKickoff ? ` · ${a.excluded.afterKickoff} salvate după start` : ''}. Clasamentul ia doar modelul actual, înainte de meci.</p>}
      </div></details>
      {a.recent.length > 0 && <AgentPredictionHistory agent={`${displayName} · ${ai.role}`} total={a.recent.length}
        entries={historyScope ? undefined : a.recent}
        source={historyScope ? { url: `/api/agents/${a.id}/history?month=${historyScope.month}&scope=${historyScope.scope}${historyScope.sport === 'cs' ? '&sport=cs' : ''}`, revision: createHash('sha256').update(JSON.stringify(a.recent)).digest('hex') } : undefined} />}
    </div>
  </article>;
}
