import Link from 'next/link';
import { currentUser } from '@/lib/auth';
import { many } from '@/lib/db';
import { jobEvents, jobMeta } from '@/lib/views';
import { NexusLive } from '@/components/nexus-live';
import { STATUS_RO, fmtDateTime } from '@/lib/format';
import { slotById } from '@/lib/slots';

export const dynamic = 'force-dynamic';
export default async function NexusPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const user = (await currentUser())!;
  const { job } = await searchParams;
  if (job && /^[0-9a-f-]{36}$/.test(job)) {
    const meta = await jobMeta(user.id, job);
    if (meta) {
      const events = (await jobEvents(user.id, job, 0)) ?? [];
      return <NexusLive jobId={job} initialMeta={JSON.parse(JSON.stringify(meta))} initialEvents={JSON.parse(JSON.stringify(events))} />;
    }
  }
  const jobs = await many<{ id: string; slot: string; status: string; created_at: Date }>("SELECT id, slot, status, created_at FROM ticket_generation_jobs WHERE user_id=$1 AND status IN ('QUEUED','RUNNING','WAITING','PAUSED') ORDER BY created_at DESC", [user.id]);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">NEXUS</h1>
      {jobs.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-display text-xl">Rețeaua este în repaus.</p>
          <p className="mt-2 text-muted">Nicio analiză nu rulează acum. Agenții pornesc doar când apeși CREEAZĂ BILETUL.</p>
          <Link href="/dashboard" className="btn btn-primary mt-5 px-6 py-3">Mergi la bilete</Link>
        </div>
      ) : (
        <ul className="space-y-3">{jobs.map((j) => <li key={j.id}><Link href={`/nexus?job=${j.id}`} className="card flex items-center justify-between p-4 hover:border-cyan/50"><span className="font-semibold">{slotById(j.slot)?.title}</span><span className="text-sm text-muted">{STATUS_RO[j.status]} · {fmtDateTime(j.created_at.toISOString())}</span></Link></li>)}</ul>
      )}
    </div>
  );
}
