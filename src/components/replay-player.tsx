'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { NexusView } from './nexus-view';
import { STAGE_ORDER, agentDetailsFromEvents, reduceEvents, type NexusEvent } from '@/lib/nexus-state';

const STAGE_LABELS: Record<string, string> = { SELECTING: 'Meciuri', SCOUT: 'SCOUT', STATS: 'Statistici', ANALYSIS: 'Agenți', DEBATE: 'Dezbatere', VOTING: 'Vot', BUILDING: 'Bilet' };

/** Read-only playback of persisted events. Makes no network calls besides the initial page data. */
export function ReplayPlayer({ events, title, target, ticketId, partial }: { events: NexusEvent[]; title: string; target: number; ticketId: string; partial: boolean }) {
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const shown = useMemo(() => events.slice(0, cursor), [events, cursor]);
  const state = useMemo(() => reduceEvents(shown), [shown]);
  const details = useMemo(() => agentDetailsFromEvents(shown, state.fixtures), [shown, state.fixtures]);
  useEffect(() => {
    if (!playing || cursor >= events.length) { if (cursor >= events.length) setPlaying(false); return; }
    const t = setTimeout(() => setCursor((c) => c + 1), 450 / speed);
    return () => clearTimeout(t);
  }, [playing, cursor, speed, events.length]);
  const stageStart = (st: string) => { const i = events.findIndex((e) => e.type === 'STAGE_CHANGED' && e.payload?.to === st); return i < 0 ? null : i + 1; };

  return (
    <div className="space-y-4">
      {partial && <p className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm text-gold">Istoric parțial: unele etape nu au fost înregistrate.</p>}
      <div className="card sticky top-[60px] z-30 flex flex-col gap-3 p-3 md:top-[64px]">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost h-10 w-10" onClick={() => { setCursor(0); setPlaying(true); }} aria-label="Restart"><RotateCcw size={16} /></button>
          <button className="btn btn-ghost h-10 w-10" onClick={() => { setPlaying(false); setCursor((c) => Math.max(0, c - 1)); }} aria-label="Pasul anterior"><ChevronLeft size={18} /></button>
          <button className="btn btn-primary h-10 px-4" onClick={() => { if (cursor >= events.length) setCursor(0); setPlaying((p) => !p); }} aria-label={playing ? 'Pauză' : 'Redă'}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? 'PAUZĂ' : 'PLAY'}</button>
          <button className="btn btn-ghost h-10 w-10" onClick={() => { setPlaying(false); setCursor((c) => Math.min(events.length, c + 1)); }} aria-label="Pasul următor"><ChevronRight size={18} /></button>
          <div className="ml-1 flex rounded-lg border border-line" role="group" aria-label="Viteză">
            {[1, 2, 4].map((s) => <button key={s} onClick={() => setSpeed(s)} className={`px-3 py-1.5 text-sm ${speed === s ? 'bg-panel-2 font-bold text-cyan' : 'text-muted'}`} aria-pressed={speed === s}>{s}×</button>)}
          </div>
          <span className="ml-auto text-xs tabular text-muted">Pas {cursor}/{events.length}</span>
          <Link href={`/tickets/${ticketId}`} className="btn btn-ghost px-3 py-2 text-sm">Înapoi la bilet</Link>
        </div>
        <input type="range" min={0} max={events.length} value={cursor} onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }} aria-label="Cronologie" className="w-full accent-cyan" />
        <div className="flex flex-wrap gap-1.5">
          {STAGE_ORDER.map((st) => { const at = stageStart(st); return <button key={st} disabled={at === null} onClick={() => { setPlaying(false); setCursor(at!); }} className="chip disabled:opacity-40">{STAGE_LABELS[st]}</button>; })}
          <button onClick={() => { setPlaying(false); setCursor(events.length); }} className="chip">Final</button>
        </div>
      </div>
      <NexusView state={state} mode="REPLAY" target={target} title={title} live={false} agentDetails={details} />
    </div>
  );
}
