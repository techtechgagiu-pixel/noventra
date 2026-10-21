'use client';
import { CreatorBadge } from '@/components/ticket-archive';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pause, Play, WifiOff } from 'lucide-react';
import { api } from '@/lib/format';
import type { NexusEvent } from '@/lib/nexus-state';
import { TERMINAL, useJobEvents, type JobMeta } from '../use-job-events';
import { AgentMap, type AgentMapHandle } from './agent-map';
import { DebateChat } from './debate-chat';

type Info = Record<string, { title: string; specialty: string; maxOdds: number; minProbability: number; model?: string | null }>;
const STATUS: Record<string, string> = { QUEUED: 'în coadă', RUNNING: 'live', WAITING: 'așteaptă limita furnizorului', PAUSED: 'în pauză', COMPLETED: 'bilet gata', INCOMPLETE: 'incomplet', NO_BET: 'NO BET', FAILED: 'eșuat' };

export function CustomLive({ jobId, initialMeta, initialEvents, info, back = { href: '/?tab=custom', label: '← Bilet custom nou' }, openTicketWhenDone = false, replayOnOpen = false }: { jobId: string; initialMeta: JobMeta; initialEvents: NexusEvent[]; info: Info; back?: { href: string; label: string } | null; openTicketWhenDone?: boolean; replayOnOpen?: boolean }) {
  const { events, meta, setMeta, connected } = useJobEvents(jobId, initialEvents, initialMeta);
  const [upTo, setUpTo] = useState(0);
  const map = useRef<AgentMapHandle>(null);
  const onProgress = useCallback((s: number) => setUpTo(s), []);
  const live = ['RUNNING', 'QUEUED', 'WAITING'].includes(meta.status);
  const done = TERMINAL.includes(meta.status);
  const behind = events.length && upTo < (events.at(-1)?.seq ?? 0);

  const router = useRouter();
  // Opens the finished ticket only when the analysis ends while it is being watched.
  const wasRunning = useRef(!TERMINAL.includes(initialMeta.status));
  useEffect(() => {
    if (openTicketWhenDone && wasRunning.current && done && meta.ticketId) { const t = setTimeout(() => router.push(`/?tab=bilete&ticket=${meta.ticketId}&fresh=1`), 2500); return () => clearTimeout(t); }
  }, [openTicketWhenDone, done, meta.ticketId, router]);
  useEffect(() => { if (replayOnOpen) { const t = setTimeout(() => map.current?.replay(2.5), 400); return () => clearTimeout(t); } }, [replayOnOpen]);

  async function resume() { await api(`/api/jobs/${jobId}/resume`, { method: 'POST' }).catch(() => {}); setMeta({ ...meta, status: 'QUEUED' }); }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {back && <Link href={back.href} className="text-sm text-muted hover:text-text">{back.label}</Link>}
        <h2 className="font-display text-lg font-bold md:ml-2">{meta.title}</h2>
        {meta.creator && <CreatorBadge c={meta.creator} />}
        {meta.subtitle && <span className="text-sm text-muted">{meta.subtitle}</span>}
        <span className={`chip ml-auto ${live ? 'text-emerald' : done && meta.status === 'COMPLETED' ? 'text-emerald' : 'text-muted'}`}>
          <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald' : 'bg-muted'}`} />{STATUS[meta.status] ?? meta.status}
        </span>
        {!connected && <span className="chip text-gold"><WifiOff size={12} aria-hidden /> reconectare…</span>}
        {done && <button onClick={() => map.current?.replay()} className="btn btn-ghost px-3 py-1.5 text-xs"><Play size={14} aria-hidden /> Redă dezbaterea</button>}
      </div>
      {meta.status === 'PAUSED' && (
        <div className="card flex flex-col gap-3 border-gold/50 p-4 md:flex-row md:items-center md:justify-between">
          <p className="flex items-center gap-2 text-sm text-gold"><Pause size={16} aria-hidden /> {meta.lastError ?? 'Analiza a fost pusă în pauză.'}</p>
          {meta.mine === false ? <span className="text-xs text-muted">Doar cel care a creat analiza o poate relua.</span> : <button onClick={resume} className="btn btn-primary px-5 py-3">CONTINUĂ ANALIZA</button>}
        </div>
      )}
      <AgentMap ref={map} events={events} target={meta.target} info={info} onProgress={onProgress} />
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>Așezați în teren după risc: prudenții în apărare, vânătorii de cote în atac. Mircea Lucescu (portar) e creierul care alege pronosticul final.</span>
        {behind ? <span className="chip text-cyan">harta redă discuția…</span> : null}
      </div>
      {done && meta.ticketId && (
        <div className="card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted">{events.some((e) => e.type === 'REVIEW_ADVICE') ? 'Analiza biletului tău e gata — verdictul e salvat cu biletul și îl urmărim până la final.' : meta.status === 'COMPLETED' ? 'Biletul tău custom e gata.' : 'Analiza s-a încheiat — vezi ce au decis agenții.'}</p>
          <Link href={`/?tab=bilete&ticket=${meta.ticketId}`} className="btn btn-primary px-5 py-3">VEZI BILETUL</Link>
        </div>
      )}
      <ReviewVerdict events={events} upTo={upTo} />
      <DebateChat events={events} upTo={upTo} live={live} />
    </div>
  );
}

const V: Record<string, { t: string; c: string }> = { SOLID: { t: '✓ SOLID', c: 'text-emerald border-emerald/50' }, RISCANT: { t: '⚠ RISCANT', c: 'text-gold border-gold/50' }, SLAB: { t: '✗ SLAB', c: 'text-rose border-rose/50' }, NEANALIZAT: { t: '— NEANALIZAT', c: 'text-muted border-line' } };

/** Verdict for a ticket the user brought: per leg (as the map reaches it) and the brain's advice. */
function ReviewVerdict({ events, upTo }: { events: NexusEvent[]; upTo: number }) {
  const seen = events.filter((e) => e.seq <= upTo);
  const legs = seen.filter((e) => e.type === 'LEG_REVIEWED');
  const advice = seen.find((e) => e.type === 'REVIEW_ADVICE');
  if (!legs.length && !advice) return null;
  return (
    <section className="card border-gold/40 p-4" aria-label="Verdictul echipei">
      <h3 className="mb-3 font-display text-base font-bold">Verdictul echipei pentru biletul tău</h3>
      <ul className="space-y-2">
        {legs.map((e) => { const p = e.payload; const v = V[p.verdict] ?? V.NEANALIZAT; return (
          <li key={e.seq} className="card-soft flex flex-wrap items-start gap-2 p-3">
            <span className={`chip shrink-0 font-bold ${v.c}`}>{v.t}</span>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{p.match} · <span className="text-cyan">{p.label}</span> @ {Number(p.odds).toFixed(2)}</p><p className="text-xs text-muted">{p.note}</p></div>
          </li>
        ); })}
      </ul>
      {advice && (
        <div className="mt-4 flex gap-3">
          <img src="/agents/robert.webp" alt="" className="h-10 w-10 shrink-0 rounded-full border-2 border-gold object-cover" />
          <div className="text-sm"><p className="font-bold text-gold">Mircea Lucescu · creierul echipei</p><p className="mt-1 leading-relaxed">{advice.payload.overall}</p>
            <ul className="mt-2 space-y-1">{(advice.payload.advice ?? []).map((a: string, i: number) => <li key={i} className="flex gap-2"><span className="text-gold">→</span><span>{a}</span></li>)}</ul></div>
        </div>
      )}
    </section>
  );
}
