import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { jobEvents, ticketDetail } from '@/lib/views';
import { ReplayPlayer } from '@/components/replay-player';

export const dynamic = 'force-dynamic';
/** Decision Replay: reads stored events only. No AI, no sports API, no jobs, no slot consumption. */
export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await currentUser())!;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await ticketDetail(user.id, id);
  if (!t) notFound();
  const events = (await jobEvents(user.id, t.jobId, 0)) ?? [];
  return <ReplayPlayer events={JSON.parse(JSON.stringify(events))} title={t.title} target={t.target} ticketId={t.id} partial={!events.some((e) => e.type === 'TICKET_FINALIZED')} />;
}
