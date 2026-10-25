'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/format';
import type { CustomBatchJob } from '@/lib/jobs/service';
const DONE = ['COMPLETED', 'INCOMPLETE', 'NO_BET', 'FAILED'];
const LABEL: Record<string, string> = { QUEUED: 'în coadă', RUNNING: 'live', WAITING: 'așteaptă', PAUSED: 'pauză', COMPLETED: 'gata', INCOMPLETE: 'incomplet', NO_BET: 'fără bilet', FAILED: 'eșuat' };

export function CustomBatch({ batch, jobId }: { batch: { id: string; index: number; count: number }; jobId: string }) {
  const [jobs, setJobs] = useState<CustomBatchJob[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const data = await api<{ jobs: CustomBatchJob[] }>(`/api/custom-tickets?batch=${batch.id}`);
        if (stopped) return;
        setJobs(data.jobs); setError(false);
        if (data.jobs.length === batch.count && data.jobs.every((j) => DONE.includes(j.status))) return;
      } catch { if (!stopped) setError(true); }
      if (!stopped) timer = setTimeout(refresh, 5000);
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [batch.id, batch.count]);
  return <section className="card space-y-3 p-4" aria-label="Lotul de bilete custom">
    <p className="text-sm"><strong>Lot de {batch.count} bilete</strong> · urmărești biletul {batch.index}/{batch.count} · {jobs.filter((j) => DONE.includes(j.status)).length} analize încheiate</p>
    <div className="flex flex-wrap gap-2">{jobs.map((j) => <Link key={j.id} href={`/?tab=custom&job=${j.id}`} aria-current={j.id === jobId ? 'page' : undefined} className={`chip ${j.id === jobId ? 'border-cyan text-cyan' : 'text-muted'}`}>Bilet {j.index} · {LABEL[j.status] ?? j.status}</Link>)}</div>
    {error && <p role="status" className="text-xs text-gold">Nu pot actualiza lotul momentan. Reîncerc automat.</p>}
    <p className="text-xs text-muted">Biletele intră în coada existentă și respectă limitele AI. Cota țintă nu garantează un bilet complet.</p>
  </section>;
}
