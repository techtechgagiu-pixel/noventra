'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { NexusView } from './nexus-view';
import { useNexusSound } from './use-sound';
import { api } from '@/lib/format';
import { agentDetailsFromEvents, reduceEvents, type NexusEvent } from '@/lib/nexus-state';

type Meta = { id: string; title: string; target: number; status: string; lastError: string | null; ticketId: string | null; nextRunAt: string };
const TERMINAL = ['COMPLETED', 'INCOMPLETE', 'NO_BET', 'FAILED'];

export function NexusLive({ jobId, initialMeta, initialEvents }: { jobId: string; initialMeta: Meta; initialEvents: NexusEvent[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [meta, setMeta] = useState(initialMeta);
  const [connected, setConnected] = useState(true);
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

  // SSE first; polling fallback when EventSource is unavailable or keeps failing.
  useEffect(() => {
    if (TERMINAL.includes(meta.status)) return;
    let es: EventSource | null = null; let poll: ReturnType<typeof setInterval> | null = null; let failures = 0; let stopped = false;
    const add = (list: NexusEvent[]) => { const fresh = list.filter((e) => e.seq > cursor.current); if (fresh.length) { cursor.current = fresh.at(-1)!.seq; setEvents((prev) => [...prev, ...fresh]); } };
    const startPolling = () => {
      if (poll) return;
      poll = setInterval(async () => {
        try { const r = await api<{ events: NexusEvent[]; meta: Meta }>(`/api/jobs/${jobId}/events?format=json&after=${cursor.current}`); add(r.events); setMeta(r.meta); setConnected(true); }
        catch { setConnected(false); }
      }, 3000);
    };
    const open = () => {
      if (stopped || typeof EventSource === 'undefined') return startPolling();
      es = new EventSource(`/api/jobs/${jobId}/events?after=${cursor.current}`);
      es.addEventListener('job', (m) => { add([JSON.parse((m as MessageEvent).data)]); setConnected(true); failures = 0; });
      es.addEventListener('meta', (m) => { const d = JSON.parse((m as MessageEvent).data); if (d) setMeta(d); setConnected(true); });
      es.addEventListener('end', () => { es?.close(); if (!stopped) setTimeout(open, 1000); });
      es.onerror = () => { es?.close(); failures++; setConnected(false); if (failures >= 3) startPolling(); else setTimeout(open, 2000 * failures); };
    };
    open();
    return () => { stopped = true; es?.close(); if (poll) clearInterval(poll); };
  }, [jobId, meta.status]);

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
          <button onClick={resume} className="btn btn-primary px-5 py-3">CONTINUĂ ANALIZA</button>
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
