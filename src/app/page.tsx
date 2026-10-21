import Link from 'next/link';
import { Activity, History, Ticket } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { many } from '@/lib/db';
import { slotStates } from '@/lib/jobs/service';
import { jobEvents, jobMeta, listTickets, ticketDetail } from '@/lib/views';
import { SlotCards } from '@/components/slot-cards';
import { TicketView, type TicketData } from '@/components/ticket-view';
import { TicketArchive } from '@/components/ticket-archive';
import { NexusLive } from '@/components/nexus-live';
import { ReplayPlayer } from '@/components/replay-player';
import { PerformancePanel } from '@/components/performance-panel';
import { STATUS_RO, fmtDateTime } from '@/lib/format';
import { slotById } from '@/lib/slots';

export const dynamic = 'force-dynamic';

type Tab = 'bilete' | 'analiza' | 'istoric';
const UUID = /^[0-9a-f-]{36}$/;
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** PRIMUL 11 — the whole app on one page, organised in three tabs. */
export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string; ticket?: string; job?: string; replay?: string; fresh?: string }> }) {
  const user = (await currentUser())!;
  const sp = await searchParams;
  const tab: Tab = sp.tab === 'analiza' || sp.tab === 'istoric' ? sp.tab : 'bilete';
  const running = await many<{ id: string; slot: string; status: string; created_at: Date }>(
    "SELECT id, slot, status, created_at FROM ticket_generation_jobs WHERE user_id=$1 AND status IN ('QUEUED','RUNNING','WAITING','PAUSED') ORDER BY created_at DESC", [user.id]);

  const tabs: Array<{ id: Tab; label: string; icon: typeof Ticket; badge?: boolean }> = [
    { id: 'bilete', label: 'Bilete', icon: Ticket },
    { id: 'analiza', label: 'Analiză', icon: Activity, badge: running.length > 0 },
    { id: 'istoric', label: 'Istoric', icon: History },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <span className="hidden sm:inline">PRIMUL <span className="text-cyan">11</span></span>
            <span className="rounded-md border border-gold/60 bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gold">Beta</span>
          </Link>
          <nav className="ml-auto flex gap-1 rounded-xl border border-line bg-panel p-1" aria-label="Secțiuni">
            {tabs.map(({ id, label, icon: Icon, badge }) => (
              <Link key={id} href={`/?tab=${id}`} aria-current={tab === id ? 'page' : undefined}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition md:px-4 ${tab === id ? 'bg-cyan/15 text-cyan' : 'text-muted hover:text-text'}`}>
                <Icon size={16} aria-hidden /> <span>{label}</span>
                {badge && <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-emerald" aria-label="analiză în curs" />}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        {tab === 'bilete' && <BileteTab userId={user.id} ticket={sp.ticket} fresh={sp.fresh === '1'} running={running.length} />}
        {tab === 'analiza' && <AnalizaTab userId={user.id} job={sp.job} replay={sp.replay} running={running} />}
        {tab === 'istoric' && <IstoricTab userId={user.id} ticket={sp.ticket} />}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted">18+ · Analizele nu garantează rezultatele și nu plasează pariuri. Joacă responsabil.</footer>
    </>
  );
}

async function TicketPanel({ userId, id, fresh, back }: { userId: string; id: string; fresh: boolean; back: string }) {
  const t = UUID.test(id) ? await ticketDetail(userId, id) : null;
  if (!t) return <p className="card p-6 text-muted">Biletul nu a fost găsit. <Link className="text-cyan" href={back}>Înapoi</Link></p>;
  return (
    <div className="space-y-3">
      <Link href={back} className="text-sm text-muted hover:text-text">← Înapoi</Link>
      <TicketView t={plain(t) as unknown as TicketData} fresh={fresh} />
    </div>
  );
}

async function BileteTab({ userId, ticket, fresh, running }: { userId: string; ticket?: string; fresh: boolean; running: number }) {
  if (ticket) return <TicketPanel userId={userId} id={ticket} fresh={fresh} back="/?tab=bilete" />;
  const slots = await slotStates(userId);
  return (
    <div className="space-y-5">
      <div>
        <p className="max-w-2xl text-sm text-muted">Apasă <strong className="text-text">CREEAZĂ BILETUL</strong>: cei 11 agenți analizează meciurile de azi și mâine, votează și construiesc biletul din cote mici. Urmărești totul în fila <Link href="/?tab=analiza" className="text-cyan">Analiză</Link>.</p>
        {running > 0 && <p className="chip mt-3 text-emerald"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald" /> {running === 1 ? 'O analiză rulează acum' : `${running} analize rulează acum`} — <Link href="/?tab=analiza" className="underline">vezi live</Link></p>}
      </div>
      <SlotCards initial={plain(slots)} />
    </div>
  );
}

async function AnalizaTab({ userId, job, replay, running }: { userId: string; job?: string; replay?: string; running: Array<{ id: string; slot: string; status: string; created_at: Date }> }) {
  if (replay && UUID.test(replay)) {
    const t = await ticketDetail(userId, replay);
    if (t) {
      const events = (await jobEvents(userId, t.jobId, 0)) ?? [];
      return <ReplayPlayer events={plain(events)} title={t.title} target={t.target} ticketId={t.id} partial={!events.some((e) => e.type === 'TICKET_FINALIZED')} />;
    }
  }
  // Explicit job, else the newest running one, else the newest job of today.
  let jobId = job && UUID.test(job) ? job : running[0]?.id;
  if (!jobId) jobId = (await many<{ id: string }>('SELECT id FROM ticket_generation_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [userId]))[0]?.id;
  const meta = jobId ? await jobMeta(userId, jobId) : null;
  if (!jobId || !meta) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-xl">Rețeaua este în repaus.</p>
        <p className="mt-2 text-muted">Nicio analiză încă. Agenții pornesc când apeși CREEAZĂ BILETUL.</p>
        <Link href="/?tab=bilete" className="btn btn-primary mt-5 px-6 py-3">Mergi la bilete</Link>
      </div>
    );
  }
  const events = (await jobEvents(userId, jobId, 0)) ?? [];
  return (
    <div className="space-y-4">
      {running.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {running.map((j) => (
            <Link key={j.id} href={`/?tab=analiza&job=${j.id}`} className={`chip ${j.id === jobId ? 'text-cyan' : 'text-muted'}`}>
              {slotById(j.slot)?.title ?? j.slot} · {STATUS_RO[j.status]} · {fmtDateTime(j.created_at.toISOString())}
            </Link>
          ))}
        </div>
      )}
      <NexusLive key={jobId} jobId={jobId} initialMeta={plain(meta)} initialEvents={plain(events)} />
    </div>
  );
}

async function IstoricTab({ userId, ticket }: { userId: string; ticket?: string }) {
  if (ticket) return <TicketPanel userId={userId} id={ticket} fresh={false} back="/?tab=istoric" />;
  const tickets = await listTickets(userId);
  return (
    <div className="space-y-10">
      <TicketArchive tickets={JSON.parse(JSON.stringify(tickets))} />
      <PerformancePanel />
    </div>
  );
}
