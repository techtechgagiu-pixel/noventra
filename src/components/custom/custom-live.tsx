'use client';
import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { Pause, Play, WifiOff } from 'lucide-react';
import { api } from '@/lib/format';
import type { NexusEvent } from '@/lib/nexus-state';
import { TERMINAL, useJobEvents, type JobMeta } from '../use-job-events';
import { AgentMap, type AgentMapHandle } from './agent-map';
import { DebateChat } from './debate-chat';

type Info = Record<string, { title: string; specialty: string; maxOdds: number; minProbability: number; model?: string | null }>;
const STATUS: Record<string, string> = { QUEUED: 'în coadă', RUNNING: 'live', WAITING: 'așteaptă limita furnizorului', PAUSED: 'în pauză', COMPLETED: 'bilet gata', INCOMPLETE: 'incomplet', NO_BET: 'NO BET', FAILED: 'eșuat' };

export function CustomLive({ jobId, initialMeta, initialEvents, info }: { jobId: string; initialMeta: JobMeta; initialEvents: NexusEvent[]; info: Info }) {
  const { events, meta, setMeta, connected } = useJobEvents(jobId, initialEvents, initialMeta);
  const [upTo, setUpTo] = useState(0);
  const map = useRef<AgentMapHandle>(null);
  const onProgress = useCallback((s: number) => setUpTo(s), []);
  const live = ['RUNNING', 'QUEUED', 'WAITING'].includes(meta.status);
  const done = TERMINAL.includes(meta.status);
  const behind = events.length && upTo < (events.at(-1)?.seq ?? 0);

  async function resume() { await api(`/api/jobs/${jobId}/resume`, { method: 'POST' }).catch(() => {}); setMeta({ ...meta, status: 'QUEUED' }); }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/?tab=custom" className="text-sm text-muted hover:text-text">← Bilet custom nou</Link>
        <h2 className="font-display text-lg font-bold md:ml-2">{meta.title}</h2>
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
          <button onClick={resume} className="btn btn-primary px-5 py-3">CONTINUĂ ANALIZA</button>
        </div>
      )}
      <AgentMap ref={map} events={events} target={meta.target} info={info} onProgress={onProgress} />
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>Așezați în teren după risc: prudenții în apărare, vânătorii de cote în atac. Mircea Lucescu (portar) e creierul care alege pronosticul final.</span>
        {behind ? <span className="chip text-cyan">harta redă discuția…</span> : null}
      </div>
      {done && meta.ticketId && (
        <div className="card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted">{meta.status === 'COMPLETED' ? 'Biletul tău custom e gata.' : 'Analiza s-a încheiat — vezi ce au decis agenții.'}</p>
          <Link href={`/?tab=bilete&ticket=${meta.ticketId}`} className="btn btn-primary px-5 py-3">VEZI BILETUL</Link>
        </div>
      )}
      <DebateChat events={events} upTo={upTo} live={live} />
    </div>
  );
}
