import type { AgentStat } from '@/lib/agent-stats';
import Link from 'next/link';
import { AgentPlayerCard } from './agent-player-card';
import { AGENT_RANKS } from '@/lib/agent-progression';
import { rankAgents } from '@/lib/agent-ranking';

const money = (x: number) => (x < 0.01 && x > 0 ? '< 0,01 $' : `${x.toFixed(2).replace('.', ',')} $`);
const num = (x: number) => new Intl.NumberFormat('ro-RO').format(Math.round(x));

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const monthName = (m: string) => (m === 'all' ? 'de la început' : `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`);
const shift = (m: string, k: number) => { const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + k, 1)); return d.toISOString().slice(0, 7); };

export function StatsView({ agents, totals, month, scope = 'all', identity = 'characters' }: { agents: AgentStat[]; totals: { today: number; week: number; total: number; calls: number; cap: number }; month: string; scope?: 'all' | 'mine'; identity?: 'characters' | 'models' }) {
  const now = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const choices = [now, shift(now, -1), shift(now, -2), 'all'];
  const sorted = rankAgents(agents);
  const identityQuery = identity === 'models' ? '&vedere=modele' : '';
  const used = Math.min(1, totals.cap ? totals.today / totals.cap : 0);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[1.9rem] font-bold leading-tight tracking-tight">Statistici</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Ultima poziție a fiecărui agent pe fiecare meci, fără dublarea analizelor repetate. Luna se referă la data meciului. Rata și mediile folosesc doar selecțiile decise (verde/roșu), inclusiv cele rămase în afara biletelor. Data analizei este afișată separat.</p>
        <nav aria-label="Vederea agenților" className="stats-identity-tabs">
          <Link href={`/?tab=statistici&luna=${month}&scope=${scope}`} aria-current={identity === 'characters' ? 'page' : undefined}>Personaje</Link>
          <Link href={`/?tab=statistici&luna=${month}&scope=${scope}&vedere=modele`} aria-current={identity === 'models' ? 'page' : undefined}>Modele AI</Link>
        </nav>
        {identity === 'models' && <p className="stats-ai-note">Modelul atribuit acum, cu personajul și caracterul lui. Portretele sunt interpretări artistice. Rezultatele aparțin fiecărui agent și pot include rulări cu modele de rezervă; agenții cu același model rămân separați.</p>}
        <nav aria-label="Sfera statisticilor" className="mt-3 flex gap-2"><Link href={`/?tab=statistici&luna=${month}&scope=all${identityQuery}`} aria-current={scope === 'all' ? 'page' : undefined} className={`chip ${scope === 'all' ? 'text-cyan' : 'text-muted'}`}>Toată comunitatea</Link><Link href={`/?tab=statistici&luna=${month}&scope=mine${identityQuery}`} aria-current={scope === 'mine' ? 'page' : undefined} className={`chip ${scope === 'mine' ? 'text-cyan' : 'text-muted'}`}>Analizele mele</Link></nav>
        <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="Luna">
          {choices.map((c) => <a key={c} href={`/?tab=statistici&luna=${c}&scope=${scope}${identityQuery}`} aria-current={c === month ? 'page' : undefined} className={`chip ${c === month ? 'text-cyan' : 'text-muted'}`}>{c === 'all' ? 'De la început' : monthName(c)}</a>)}
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
      <div className="!-mt-5 space-y-2">
        <p className="text-xs text-muted">Rezultatele respectă luna aleasă. Nivelul și rangul folosesc cariera completă din sfera selectată.</p>
        <details className="text-xs text-muted"><summary className="cursor-pointer text-cyan">Cum cresc nivelul și rangul</summary><div className="mt-2 space-y-2"><p>Un rezultat verde adaugă 30 XP; unul roșu scade 15 XP, până la minimum zero. Fiecare 100 XP înseamnă un nivel. Rezultatele în așteptare, anulate și NO BET nu modifică nivelul.</p><div className="flex flex-wrap gap-2">{AGENT_RANKS.map((r) => <span key={r.id} className="player-rank-rule" data-rarity={r.id}><strong>{r.name}</strong> {r.minimum ? `≥ ${r.minimum} decise · ${r.strict ? '>' : '≥'} ${Math.round(r.rate * 100)}% verzi` : 'rang inițial'}</span>)}</div><p>Diamond Super cere peste 80% verzi în carieră și minimum 15 rezultate decise; la exact 80% rangul este Super. Rangul poate scădea după rezultate roșii sau corecții oficiale. Indicator vizual al istoricului; nu estimează rezultatele viitoare. Corina și SCOUT au roluri editoriale.</p></div></details>
      </div>
      <section aria-label="Agenții" className="agent-player-grid">
        {sorted.map((a, rank) => <AgentPlayerCard key={`${identity}:${a.id}`} identity={identity} agent={a} place={rank + 1} monthLabel={month === 'all' ? 'luna curentă' : monthName(month)} />)}
      </section>
    </div>
  );
}
