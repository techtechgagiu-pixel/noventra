'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/format';
import type { NexusEvent } from '@/lib/nexus-state';

export type JobMeta = { id: string; title: string; subtitle?: string; target: number; requiredLegs?: number | null; status: string; lastError: string | null; ticketId: string | null; nextRunAt: string };
export const TERMINAL = ['COMPLETED', 'INCOMPLETE', 'NO_BET', 'FAILED'];

/** Live job events: SSE first, JSON polling as fallback. Shared by the Nexus view and the custom-ticket map. */
export function useJobEvents(jobId: string, initialEvents: NexusEvent[], initialMeta: JobMeta) {
  const [events, setEvents] = useState(initialEvents);
  const [meta, setMeta] = useState(initialMeta);
  const [connected, setConnected] = useState(true);
  const cursor = useRef(initialEvents.at(-1)?.seq ?? 0);

  useEffect(() => {
    if (TERMINAL.includes(meta.status)) return;
    let es: EventSource | null = null; let poll: ReturnType<typeof setInterval> | null = null; let failures = 0; let stopped = false;
    const add = (list: NexusEvent[]) => { const fresh = list.filter((e) => e.seq > cursor.current); if (fresh.length) { cursor.current = fresh.at(-1)!.seq; setEvents((prev) => [...prev, ...fresh]); } };
    const startPolling = () => {
      if (poll) return;
      poll = setInterval(async () => {
        try { const r = await api<{ events: NexusEvent[]; meta: JobMeta }>(`/api/jobs/${jobId}/events?format=json&after=${cursor.current}`); add(r.events); setMeta(r.meta); setConnected(true); }
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

  return { events, meta, setMeta, connected };
}
