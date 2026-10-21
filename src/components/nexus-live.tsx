'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { NexusView } from './nexus-view';
import { useNexusSound } from './use-sound';
import { api } from '@/lib/format';
import { TERMINAL, useJobEvents, type JobMeta } from './use-job-events';
import { agentDetailsFromEvents, reduceEvents, type NexusEvent } from '@/lib/nexus-state';

type Meta = JobMeta;

export function NexusLive({ jobId, initialMeta, initialEvents }: { jobId: string; initialMeta: Meta; initialEvents: NexusEvent[] }) {
  const { events, meta, setMeta, connected } = useJobEvents(jobId, initialEvents, initialMeta);
  const router = useRouter();
  const cursor = useRef(initialEvents.at(-1)?.seq ?? 0);
  const state = useMemo(() => reduceEvents(events), [events]);
  const details = useMemo(() => agentDetailsFromEvents(events, state.fixtures), [events, state.fixtures]);
  const active = connected && ['RUNNING', 'QUEUED'].includes(meta.status);
  const working = active && Object.values(state.agents).some((a) => a.status === 'ANALYZING' || a.status === 'DEBATING');
  const sound = useNexusSound(working);
  const lastCue = useRef(cursor.current);

  useEffect(() => {
    for (const e of events) {
      if (e.seq <= lastCue.current) continue;
      lastCue.current = e.seq;
      if (e.type === 'AGENT_COMPLETED') sound.cue('complete');
      else if (e.type === 'DEBATE_STARTED') sound.cue('debate');
      else if (e.type === 'CONSENSUS_CALCULATED') sound.cue('vote');
      else if (e.type === 'TICKET_FINALIZED') sound.cue('ticket');
      else if (e.type === 'JOB_PAUSED') sound.cue('error');
    }
  }, [events, sound]);

  // Open the final result automatically — only when the analysis finishes while it is being watched,
  // never when an already-finished analysis is simply opened in the Analiză tab.
  const wasRunningAtOpen = useRef(!TERMINAL.includes(initialMeta.status));
  useEffect(() => {
    if (wasRunningAtOpen.current && TERMINAL.includes(meta.status) && meta.ticketId) { const t = setTimeout(() => router.push(`/?tab=bilete&ticket=${meta.ticketId}&fresh=1`), 1800); return () => clearTimeout(t); }
  }, [meta.status, meta.ticketId, router]);

  async function resume() { await api(`/api/jobs/${jobId}/resume`, { method: 'POST' }).catch(() => {}); setMeta({ ...meta, status: 'QUEUED' }); }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`chip ${active ? 'text-emerald' : 'text-muted'}`}><span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald' : 'bg-muted'}`} />LIVE · {meta.status === 'WAITING' ? 'așteaptă limita furnizorului' : meta.status === 'PAUSED' ? 'în pauză' : meta.status === 'QUEUED' ? 'în coadă' : meta.status === 'RUNNING' ? 'execuție reală' : meta.status}</span>
        {!connected && <span className="chip text-gold"><WifiOff size={12} aria-hidden /> Conexiune pierdută — animațiile sunt oprite; reîncerc.</span>}
        <button onClick={sound.toggle} className="btn btn-ghost ml-auto px-3 py-1.5 text-xs" aria-pressed={sound.enabled}>{sound.enabled ? <Volume2 size={14} /> : <VolumeX size={14} />} Sunet {sound.enabled ? 'pornit' : 'oprit'}</button>
        {sound.enabled && <input type="range" min={0} max={1} step={0.05} value={sound.volume} onChange={(e) => sound.setVolume(Number(e.target.value))} aria-label="Volum" className="w-24 accent-cyan" />}
      </div>
      {meta.status === 'PAUSED' && (
        <div className="card flex flex-col gap-3 border-gold/50 p-4 md:flex-row md:items-center md:justify-between">
          <p className="flex items-center gap-2 text-sm text-gold"><Pause size={16} aria-hidden /> {meta.lastError ?? 'Analiza a fost pusă în pauză.'} Reluarea continuă aceeași analiză, cu aceleași meciuri.</p>
          {meta.mine === false ? <span className="text-xs text-muted">Doar cel care a creat analiza o poate relua.</span> : <button onClick={resume} className="btn btn-primary px-5 py-3">CONTINUĂ ANALIZA</button>}
        </div>
      )}
      {TERMINAL.includes(meta.status) && meta.ticketId && !wasRunningAtOpen.current && (
        <div className="card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted">Analiza s-a încheiat. Mai jos vezi tot ce au făcut agenții.</p>
          <a href={`/?tab=bilete&ticket=${meta.ticketId}`} className="btn btn-primary px-5 py-3">VEZI BILETUL</a>
        </div>
      )}
      {['RUNNING', 'QUEUED', 'WAITING'].includes(meta.status) && <p className="text-xs text-muted">Poți închide pagina: analiza e salvată pe server și continuă cât timp serviciul e activ. Dacă serverul gratuit adoarme, reia automat din ultimul pas salvat la următoarea vizită.</p>}
      <NexusView state={state} mode="LIVE" target={meta.target} title={meta.title} live={active} agentDetails={details} />
    </div>
  );
}
