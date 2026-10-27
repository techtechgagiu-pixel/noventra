'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AGENT_META, fmtDateTime } from '@/lib/format';
import type { NexusEvent } from '@/lib/nexus-state';
import { AgentMap } from '../custom/agent-map';

type Moment = { seq: number; agent: string | null; kind: 'pick' | 'objection' | 'brain' | 'ticket' | 'revised' | 'news'; text: string; detail?: string };
const WORDS = ['Analizează', 'Dezbate', 'Decide'] as const;
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Moments worth showing on screen, taken verbatim from the recorded analysis. */
function moments(events: NexusEvent[]): Moment[] {
  const out: Moment[] = [];
  let picks = 0;
  for (const e of events) {
    const p = e.payload ?? {};
    if (e.type === 'PREDICTION_SAVED' && p.decision === 'BET_CANDIDATE' && p.rationale && picks < 4) { picks++; out.push({ seq: e.seq, agent: e.agentId, kind: 'pick', text: cut(String(p.rationale), 150), detail: `${p.marketLabel ?? p.marketKey}${p.odds ? ` @ ${Number(p.odds).toFixed(2)}` : ''} · ${p.match}` }); }
    else if (e.type === 'NEWS_COLLECTED' && p.headlines?.[0]) out.push({ seq: e.seq, agent: 'hantu', kind: 'news', text: cut(String(p.headlines[0].title), 120), detail: `${p.headlines[0].source ?? 'presă'} · ${p.match}` });
    else if (e.type === 'NEWS_COMMENTARY' && p.commentary) out.push({ seq: e.seq, agent: 'corina', kind: 'news', text: cut(String(p.commentary), 160), detail: String(p.match ?? '') });
    else if (e.type === 'OBJECTION_RECORDED' && p.objection) out.push({ seq: e.seq, agent: e.agentId, kind: 'objection', text: cut(String(p.objection), 160), detail: 'obiecție în dezbatere' });
    else if (e.type === 'POSITION_REVISED' && p.changed && p.response) out.push({ seq: e.seq, agent: e.agentId, kind: 'revised', text: cut(String(p.response), 150), detail: 'își schimbă poziția' });
    else if (e.type === 'BRAIN_DECISION' && p.choice) out.push({ seq: e.seq, agent: 'robert', kind: 'brain', text: cut(String(p.reason ?? ''), 160), detail: `alege ${p.label}${p.odds ? ` @ ${Number(p.odds).toFixed(2)}` : ''} · ${p.match}` });
    else if (e.type === 'TICKET_FINALIZED' && p.totalOdds) out.push({ seq: e.seq, agent: null, kind: 'ticket', text: `Bilet gata: cota ${Number(p.totalOdds).toFixed(2)} din ${p.legs} meciuri.`, detail: p.review ? 'bilet adus la analiză' : undefined });
  }
  return out;
}

function phaseOf(events: NexusEvent[], upTo: number) {
  let phase = 0;
  for (const e of events) {
    if (e.seq > upTo) break;
    if (e.stage === 'DEBATE') phase = Math.max(phase, 1);
    if (e.stage === 'VOTING' || e.stage === 'BUILDING' || e.stage === 'DONE') phase = 2;
    if (e.type === 'BATCH_STARTED') phase = 0;
  }
  return phase;
}

export function HomeStage({ events, title, finishedAt, target }: { events: NexusEvent[]; title: string; finishedAt: string | null; target: number }) {
  const [upTo, setUpTo] = useState(0);
  const onProgress = useCallback((s: number) => setUpTo(s), []);
  const all = useMemo(() => moments(events), [events]);
  const phase = phaseOf(events, upTo);
  // Lower-third: one moment at a time, each held long enough to read (newest wins when several arrive at once).
  const [shown, setShown] = useState<Moment | null>(null);
  const lastAt = useRef(0);
  useEffect(() => {
    if (!upTo) { setShown(null); return; }
    const reached = all.filter((m) => m.seq <= upTo);
    const latest = reached.at(-1);
    if (!latest || latest.seq === shown?.seq) return;
    const wait = Math.max(0, 3200 - (Date.now() - lastAt.current));
    const t = setTimeout(() => { setShown(latest); lastAt.current = Date.now(); }, wait);
    return () => clearTimeout(t);
  }, [upTo, all, shown?.seq]);

  const meta = shown?.agent ? AGENT_META[shown.agent] : null;
  const tone = shown?.kind === 'objection' ? '#ffe36e' : shown?.kind === 'brain' ? '#ffe36e' : shown?.kind === 'ticket' ? '#7fdc6c' : meta?.accent ?? '#ffbe3d';

  const words = (
    <h1 className="font-display text-[clamp(2.4rem,9vw,3.6rem)] lg:text-[clamp(2.6rem,3.9vw,3.9rem)] font-bold leading-[0.95] tracking-[-0.03em]" aria-label="Analizează. Dezbate. Decide.">
      {WORDS.map((w, i) => (
        <span key={w} className="block transition-[color,opacity] duration-700" style={{ color: i === phase ? '#eef5ec' : 'rgba(238,242,251,0.22)' }}>{w}.</span>
      ))}
    </h1>
  );
  const lower = (
    <div className="min-h-[112px]" aria-live="polite">
      {shown && (
        <div key={shown.seq} className="animate-[lowerthird_.5s_cubic-bezier(.2,.8,.2,1)] flex w-full max-w-xl items-stretch overflow-hidden rounded-xl border border-white/10 bg-[#0b1d15]/92 shadow-2xl backdrop-blur">
          <div className="w-1.5 shrink-0" style={{ background: tone }} />
          {meta ? <img src={meta.img} alt="" className="h-auto w-20 shrink-0 object-cover" /> : <img src="/logo.svg" alt="" className="h-20 w-20 shrink-0 p-3" />}
          <div className="min-w-0 px-4 py-3">
            <p className="text-sm font-bold" style={{ color: tone }}>{meta?.name ?? 'Primul 11'}{shown.detail && <span className="font-normal text-muted"> — {shown.detail}</span>}</p>
            <p className="mt-1 text-[15px] leading-snug text-text">{shown.kind === 'objection' || shown.kind === 'revised' || shown.kind === 'pick' || shown.kind === 'brain' ? `„${shown.text}”` : shown.text}</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section aria-label="Reluare dintr-o analiză reală" className="grid items-center gap-6 lg:grid-cols-[minmax(320px,0.8fr)_1.7fr] lg:gap-10">
      <div className="min-w-0 space-y-5">
        {words}
        <p className="max-w-md text-[15px] leading-relaxed text-muted">Modelele AI citesc cotele reale, istoricul și știrile, se contrazic în dezbatere, iar GPT-6 Luna Pro alege pronosticul care intră pe bilet.</p>
        <div className="hidden lg:block">{lower}</div>
      </div>
      <div className="min-w-0">
        <div className="overflow-hidden rounded-[1.6rem] border border-line shadow-[0_30px_80px_-30px_rgba(94,231,247,.25)]">
          <AgentMap events={events} target={target} onProgress={onProgress} autoplay={{ speed: 1.7, pauseMs: 5000 }}
            height={(w) => (w < 640 ? Math.max(680, w * 2.0) : Math.min(600, Math.max(420, w * 0.56)))} className="relative bg-ink" />
        </div>
        <p className="mt-2 text-[11px] text-muted">Reluare din analiza reală „{title}”{finishedAt ? `, încheiată ${fmtDateTime(finishedAt)}` : ''}.</p>
        <div className="mt-3 lg:hidden">{lower}</div>
      </div>
    </section>
  );
}
