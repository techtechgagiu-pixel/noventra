'use client';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, CircleSlash, Database, Loader2, Search, X } from 'lucide-react';
import { AGENT_META, fmtTime, odds } from '@/lib/format';
import { STAGE_ORDER, progress, type AgentView, type NexusState } from '@/lib/nexus-state';

const STAGE_LABELS: Record<string, string> = { SELECTING: 'Alegerea meciurilor', SCOUT: 'Cercetarea SCOUT', STATS: 'Calculele statistice', ANALYSIS: 'Analiza celor șase agenți', DEBATE: 'Dezbaterea', VOTING: 'Votarea și validarea', BUILDING: 'Construirea biletului' };
const STATUS_LABEL: Record<string, string> = { IDLE: 'În așteptare', ANALYZING: 'Analizează', DEBATING: 'Dezbate', DONE: 'Gata', FAILED: 'Abținere (eroare)', WAITING: 'Așteaptă limita' };
const ORDER = ['victor', 'andrei', 'mihai', 'alex', 'diana', 'robert', 'ioana', 'radu', 'elena', 'cosmin'];
const shown = (s: NexusState) => (s.participants.length >= 6 && s.participants.length < ORDER.length && !!s.final ? ORDER.filter((id) => s.participants.includes(id)) : ORDER);

export type AgentDetail = { agentId: string; items: Array<{ fixture: string; round: number; provider: string; model: string; decision: string; market: string | null; probability: number | null; confidence: number; rationale: string; evidence: string[]; failureReasons: string[]; objection?: string; response?: string }> };

export function NexusView({ state, mode, target, title, live, agentDetails }: { state: NexusState; mode: 'LIVE' | 'REPLAY'; target: number; title: string; live: boolean; agentDetails?: Record<string, AgentDetail> }) {
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const p = progress(state);
  const working = Object.values(state.agents).some((a) => a.status === 'ANALYZING' || a.status === 'DEBATING') || state.scout.status === 'RESEARCHING';
  const animate = mode === 'REPLAY' || (live && working);
  const currentIdx = STAGE_ORDER.indexOf(state.stage);
  const fixtures = useMemo(() => state.order.map((id) => state.fixtures[id]).filter(Boolean), [state]);
  const activeFx = fixtures.filter((f) => ['RESEARCH', 'ANALYSIS', 'DEBATE', 'VOTING'].includes(f.state)).slice(0, 6);

  return (
    <div className="space-y-5">
      {mode === 'REPLAY' && <div className="rounded-xl border border-gold/50 bg-gold/10 px-4 py-2 text-center text-sm font-bold tracking-widest text-gold">REPLAY — ANALIZĂ SALVATĂ · fără execuție AI</div>}
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan">{mode === 'LIVE' ? (live ? 'Execuție în timp real' : 'Execuție oprită') : 'Reconstituire din evenimente salvate'}</p>
          <h1 className="font-display text-3xl font-bold md:text-4xl">{mode === 'LIVE' && !state.final ? 'AI-ul pregătește biletul tău.' : mode === 'REPLAY' ? 'Cum a fost creat biletul' : 'Analiza s-a încheiat.'}</h1>
          <p className="text-muted">{title} · ținta <span className="font-semibold text-text tabular">{target}</span></p>
        </div>
        {state.seed && <p className="text-xs text-muted">Seed explorare: <code className="text-text">{state.seed}…</code></p>}
      </div>

      {/* Progress */}
      <div className="card p-4">
        <div className="flex items-center justify-between text-sm"><span className="font-medium">{STAGE_LABELS[state.stage] ?? (state.final ? 'Finalizat' : 'În coadă')}</span><span className="tabular text-muted">{Math.round(p * 100)}%</span></div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-graphite" role="progressbar" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-cyan to-emerald transition-all duration-700" style={{ width: `${p * 100}%` }} />
        </div>
        {live && working && <div className="indeterminate mt-1 h-0.5 rounded-full" aria-hidden />}
        {state.waiting && <p className="mt-2 text-xs text-gold">{state.waiting}</p>}
        <ol className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
          {STAGE_ORDER.map((st, i) => {
            const done = state.final ? true : i < currentIdx;
            const active = !state.final && i === currentIdx;
            return (
              <li key={st} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 ${active ? 'border-cyan/60 bg-cyan/10 text-text' : done ? 'border-emerald/30 text-emerald' : 'border-line text-muted'}`}>
                {done ? <CheckCircle2 size={13} aria-hidden /> : active && live ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <span className="grid h-3.5 w-3.5 place-items-center rounded-full border border-current text-[9px]">{i + 1}</span>}
                <span>{STAGE_LABELS[st]}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Agents */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {shown(state).map((id) => <AgentPortrait key={id} a={state.agents[id]} live={animate} onOpen={() => setOpenAgent(id)} />)}
      </div>

      {/* Network */}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="card relative overflow-hidden p-2">
          <Network state={state} animate={animate} activeFx={activeFx.map((f) => f.match)} />
          <div className="absolute left-4 top-3 flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 rounded-full ${state.scout.status === 'RESEARCHING' && animate ? 'working bg-cyan' : state.scout.status === 'DONE' ? 'bg-cyan' : 'bg-muted'}`} />
            <span className="font-semibold text-cyan">SCOUT</span><span className="text-muted">{state.scout.message ?? 'Cercetare istorică — nu votează'}</span>
          </div>
        </div>
        <div className="space-y-4">
          <Panel title={`Selecții acceptate (${state.accepted.length})`} tone="good">
            {state.accepted.length === 0 ? <p className="text-sm text-muted">Încă nicio selecție cu consens validat.</p> :
              state.accepted.map((id) => { const f = state.fixtures[id]; return <Row key={id} title={f.match} sub={`${f.marketLabel ?? ''} · ${f.votesFor}/${f.total ?? state.total} voturi`} value={odds(f.odds)} />; })}
            {state.assembly.length > 0 && <div className="mt-3 border-t border-line pt-3 text-xs text-muted">Asamblare: {state.assembly.map((s) => odds(s.odds)).join(' × ')} = <span className="font-bold text-text tabular">{odds(state.assembly.at(-1)?.running)}</span></div>}
          </Panel>
          <Panel title={`Respinse (${state.rejected.length})`} tone="bad">
            {state.rejected.slice(-6).reverse().map((id) => { const f = state.fixtures[id]; return <Row key={id} title={f.match} sub={f.reason ?? ''} />; })}
            {state.rejected.length === 0 && <p className="text-sm text-muted">—</p>}
          </Panel>
        </div>
      </div>

      {/* Activity log */}
      <div className="card p-4">
        <h2 className="mb-2 flex items-center gap-2 font-display font-bold"><Database size={16} aria-hidden /> Jurnalul analizei</h2>
        <ol className="max-h-72 space-y-1 overflow-y-auto pr-2 text-sm" aria-live={mode === 'LIVE' ? 'polite' : 'off'}>
          {[...state.log].reverse().map((l) => (
            <li key={l.seq} className={`flex gap-3 ${l.tone === 'good' ? 'text-emerald' : l.tone === 'bad' ? 'text-rose' : l.tone === 'warn' ? 'text-gold' : 'text-muted'}`}>
              <span className="w-16 shrink-0 tabular text-xs opacity-70">{fmtTime(l.at)}</span><span>{l.text}</span>
            </li>
          ))}
        </ol>
      </div>

      <AnimatePresence>
        {openAgent && <AgentDrawer id={openAgent} a={state.agents[openAgent]} detail={agentDetails?.[openAgent]} mode={mode} onClose={() => setOpenAgent(null)} />}
      </AnimatePresence>
    </div>
  );
}

function AgentPortrait({ a, live, onOpen }: { a: AgentView; live: boolean; onOpen: () => void }) {
  const m = AGENT_META[a.id];
  const busy = a.status === 'ANALYZING' || a.status === 'DEBATING';
  return (
    <button onClick={onOpen} className="card group overflow-hidden text-left" style={{ ['--ring' as string]: `${m.accent}88` }} aria-label={`${m.name}, ${m.title}: ${STATUS_LABEL[a.status]}`}>
      <div className={`relative aspect-[3/4] overflow-hidden ${busy && live ? 'working' : ''}`} style={{ borderBottom: `2px solid ${m.accent}` }}>
        <img src={m.img} alt="" className={`h-full w-full object-cover object-top transition duration-500 ${a.status === 'IDLE' ? 'opacity-60 grayscale-[.4]' : 'opacity-100'} group-hover:scale-105`} />
        <span className="chip absolute left-2 top-2 bg-ink/70 backdrop-blur" style={{ color: m.accent, borderColor: `${m.accent}66` }}>
          {busy && live && <Loader2 size={11} className="animate-spin" aria-hidden />}{STATUS_LABEL[a.status]}
        </span>
      </div>
      <div className="p-3">
        <p className="font-display font-bold" style={{ color: m.accent }}>{m.name}</p>
        <p className="text-xs text-muted">{m.title}</p>
        <p className="mt-1 truncate text-[11px] text-muted" title={a.model ?? ''}>{a.model ?? 'model nealocat încă'}{a.usedFallback ? ' (rezervă)' : ''}</p>
        <p className="mt-1 line-clamp-2 min-h-8 text-xs">{a.lastConclusion ?? '—'}</p>
      </div>
    </button>
  );
}

function Network({ state, animate, activeFx }: { state: NexusState; animate: boolean; activeFx: string[] }) {
  const cx = 380, cy = 210, r = 150;
  const ids = shown(state);
  const nodes = ids.map((id, i) => { const ang = (-90 + (i * 360) / ids.length) * (Math.PI / 180); return { id, x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) }; });
  return (
    <svg viewBox="0 0 760 420" className="h-auto w-full" role="img" aria-label="Rețeaua NEXUS: meciuri, agenți și nucleul de decizie">
      <defs>
        <radialGradient id="core" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#5ee7f7" stopOpacity=".55" /><stop offset="100%" stopColor="#5ee7f7" stopOpacity="0" /></radialGradient>
      </defs>
      {/* fixtures entering */}
      {activeFx.slice(0, 5).map((m, i) => (
        <g key={m}>
          <line x1={110} y1={70 + i * 62} x2={cx - 40} y2={cy} stroke="#5ee7f7" strokeOpacity=".35" className={animate ? 'flow' : ''} />
          <rect x={8} y={52 + i * 62} width={150} height={34} rx={9} fill="#0f1a35" stroke="#22325a" />
          <text x={16} y={74 + i * 62} fill="#eef2fb" fontSize="11">{m.length > 22 ? m.slice(0, 21) + '…' : m}</text>
        </g>
      ))}
      {nodes.map((n) => {
        const a = state.agents[n.id]; const m = AGENT_META[n.id]; const busy = a.status === 'ANALYZING' || a.status === 'DEBATING';
        return (
          <g key={n.id}>
            <line x1={cx} y1={cy} x2={n.x} y2={n.y} stroke={m.accent} strokeOpacity={busy ? 0.9 : 0.25} strokeWidth={busy ? 2 : 1} className={busy && animate ? 'flow' : ''} />
            <circle cx={n.x} cy={n.y} r={ids.length > 6 ? 21 : 24} fill="#0a1228" stroke={m.accent} strokeWidth={a.status === 'IDLE' ? 1 : 2.5} opacity={a.status === 'IDLE' ? 0.6 : 1} />
            <text x={n.x} y={n.y + 4} textAnchor="middle" fill={m.accent} fontSize={ids.length > 6 ? 9.5 : 11} fontWeight="700">{m.name}</text>
            {a.status === 'DONE' && <circle cx={n.x + 18} cy={n.y - 18} r={5} fill="#34d399" />}
            {a.status === 'FAILED' && <circle cx={n.x + 18} cy={n.y - 18} r={5} fill="#fb7185" />}
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={70} fill="url(#core)" opacity={animate ? 1 : 0.4} />
      <circle cx={cx} cy={cy} r={38} fill="#0f1a35" stroke="#5ee7f7" strokeWidth="2" />
      <text x={cx} y={cy - 2} textAnchor="middle" fill="#5ee7f7" fontSize="12" fontWeight="800" letterSpacing="2">NEXUS</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="#94a3c4" fontSize="9">CORE</text>
      {/* toward ticket */}
      <line x1={cx + 40} y1={cy} x2={700} y2={cy} stroke="#34d399" strokeOpacity={state.accepted.length ? 0.8 : 0.2} strokeWidth="2" className={state.accepted.length && animate ? 'flow' : ''} />
      <rect x={640} y={cy - 34} width={112} height={68} rx={12} fill="#0f1a35" stroke="#34d399" strokeOpacity=".6" />
      <text x={696} y={cy - 10} textAnchor="middle" fill="#94a3c4" fontSize="10">BILET</text>
      <text x={696} y={cy + 12} textAnchor="middle" fill="#eef2fb" fontSize="18" fontWeight="700">{state.accepted.length}</text>
      <text x={696} y={cy + 26} textAnchor="middle" fill="#94a3c4" fontSize="9">selecții</text>
    </svg>
  );
}

function Panel({ title, tone, children }: { title: string; tone: 'good' | 'bad'; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h3 className={`mb-2 flex items-center gap-2 text-sm font-bold ${tone === 'good' ? 'text-emerald' : 'text-rose'}`}>{tone === 'good' ? <CheckCircle2 size={15} aria-hidden /> : <CircleSlash size={15} aria-hidden />}{title}</h3>
      <div className="max-h-64 space-y-2 overflow-y-auto">{children}</div>
    </section>
  );
}
const Row = ({ title, sub, value }: { title: string; sub: string; value?: string }) => (
  <div className="flex items-start justify-between gap-3 rounded-lg bg-ink/40 px-3 py-2 text-sm">
    <div className="min-w-0"><p className="truncate font-medium">{title}</p><p className="line-clamp-2 text-xs text-muted">{sub}</p></div>
    {value && <span className="font-bold tabular text-emerald">{value}</span>}
  </div>
);

function AgentDrawer({ id, a, detail, mode, onClose }: { id: string; a: AgentView; detail?: AgentDetail; mode: string; onClose: () => void }) {
  const m = AGENT_META[id];
  return (
    <motion.div className="fixed inset-0 z-50 flex justify-end bg-ink/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.aside role="dialog" aria-label={`Detalii ${m.name}`} className="h-full w-full max-w-lg overflow-y-auto border-l border-line bg-navy p-6" initial={{ x: 40 }} animate={{ x: 0 }} exit={{ x: 40 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-4">
          <img src={m.img} alt="" className="h-24 w-18 rounded-xl object-cover object-top" style={{ width: 72 }} />
          <div className="flex-1"><p className="font-display text-2xl font-bold" style={{ color: m.accent }}>{m.name}</p><p className="text-muted">{m.title}</p><p className="mt-1 text-xs text-muted">{a.model ?? '—'}</p></div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9" aria-label="Închide"><X size={16} /></button>
        </div>
        {mode === 'REPLAY' && <p className="mt-4 text-xs text-gold">Date originale, înregistrate la generare. Explicațiile nu sunt regenerate.</p>}
        {!detail?.items.length ? <p className="mt-6 text-sm text-muted">Pozițiile detaliate apar aici după ce agentul își salvează analiza.</p> : (
          <div className="mt-5 space-y-4">
            {detail.items.map((it, i) => (
              <div key={i} className="card-soft p-4 text-sm">
                <div className="flex items-center justify-between"><p className="font-semibold">{it.fixture}</p><span className="chip">{it.round === 0 ? 'Poziție inițială' : `Revizuire runda ${it.round}`}</span></div>
                <p className="mt-1 text-xs text-muted">{it.provider}/{it.model}</p>
                <p className="mt-2"><span className={it.decision === 'BET_CANDIDATE' ? 'text-emerald' : 'text-rose'}>{it.decision === 'BET_CANDIDATE' ? `Propune: ${it.market}` : 'NO BET'}</span>{it.probability != null && <span className="text-muted"> · p≈{Math.round(it.probability * 100)}% · încredere {it.confidence}/100</span>}</p>
                {it.rationale && <p className="mt-2">{it.rationale}</p>}
                {it.evidence?.length > 0 && <><p className="mt-2 text-xs font-semibold text-muted">Dovezi</p><ul className="list-disc pl-5 text-xs">{it.evidence.map((e, j) => <li key={j}>{e}</li>)}</ul></>}
                {it.failureReasons?.length > 0 && <><p className="mt-2 text-xs font-semibold text-muted">Cum poate eșua</p><ul className="list-disc pl-5 text-xs">{it.failureReasons.map((e, j) => <li key={j}>{e}</li>)}</ul></>}
                {it.objection && <p className="mt-2 text-xs text-gold">Obiecție: {it.objection}</p>}
                {it.response && <p className="mt-1 text-xs">Răspuns: {it.response}</p>}
              </div>
            ))}
          </div>
        )}
        <p className="mt-6 flex items-center gap-1 text-xs text-muted"><Search size={12} aria-hidden /> Nu stocăm raționamentul intern al modelului, doar concluziile și dovezile verificabile.</p>
      </motion.aside>
    </motion.div>
  );
}
