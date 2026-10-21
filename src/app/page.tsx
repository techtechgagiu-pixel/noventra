import Link from 'next/link';
import { Activity, ClipboardCheck, History, SlidersHorizontal, Ticket } from 'lucide-react';
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
import { VOTING_AGENTS } from '@/lib/ai/agents';
import { activeAssignments } from '@/lib/ai/assignments';
import { allTrackRecords } from '@/lib/track-record';
import { customJobs, jobQueue, reviewJobs } from '@/lib/jobs/service';
import { ReviewBuilder } from '@/components/review/review-builder';
import { JobQueue } from '@/components/job-queue';
import { CustomForm, type AgentCard } from '@/components/custom/custom-form';
import { CustomLive } from '@/components/custom/custom-live';

export const dynamic = 'force-dynamic';

type Tab = 'bilete' | 'custom' | 'verifica' | 'analiza' | 'istoric';
const UUID = /^[0-9a-f-]{36}$/;
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** PRIMUL 11 — the whole app on one page, organised in three tabs. */
export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string; ticket?: string; job?: string; replay?: string; fresh?: string }> }) {
  const user = (await currentUser())!;
  const sp = await searchParams;
  const tab: Tab = sp.tab === 'analiza' || sp.tab === 'istoric' || sp.tab === 'custom' || sp.tab === 'verifica' ? sp.tab : 'bilete';
  const running = await many<{ id: string; slot: string; status: string; created_at: Date }>(
    "SELECT id, slot, status, created_at FROM ticket_generation_jobs WHERE user_id=$1 AND status IN ('QUEUED','RUNNING','WAITING','PAUSED') ORDER BY created_at DESC", [user.id]);

  const tabs: Array<{ id: Tab; label: string; icon: typeof Ticket; badge?: boolean }> = [
    { id: 'bilete', label: 'Bilete', icon: Ticket },
    { id: 'custom', label: 'Custom', icon: SlidersHorizontal, badge: running.some((j) => j.slot.startsWith('CUSTOM_')) },
    { id: 'verifica', label: 'Biletul tău', icon: ClipboardCheck, badge: running.some((j) => j.slot.startsWith('REVIEW_')) },
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
                className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition md:px-4 ${tab === id ? 'bg-cyan/15 text-cyan' : 'text-muted hover:text-text'}`}>
                <Icon size={16} aria-hidden /> <span className={id === 'bilete' || id === 'analiza' ? 'hidden sm:inline' : 'hidden md:inline'}>{label}</span>
                {badge && <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-emerald" aria-label="analiză în curs" />}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        {tab === 'bilete' && <BileteTab userId={user.id} ticket={sp.ticket} fresh={sp.fresh === '1'} running={running.length} />}
        {tab === 'custom' && <CustomTab userId={user.id} job={sp.job} />}
        {tab === 'verifica' && <VerificaTab userId={user.id} job={sp.job} />}
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
        <p className="max-w-2xl text-sm text-muted">Apasă <strong className="text-text">CREEAZĂ BILETUL</strong>: cei 12 agenți analizează meciurile de azi și mâine, votează și construiesc biletul din cote mici. Urmărești totul în fila <Link href="/?tab=analiza" className="text-cyan">Analiză</Link>.</p>
        {running > 0 && <p className="chip mt-3 text-emerald"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald" /> {running === 1 ? 'O analiză rulează acum' : `${running} analize rulează acum`} — <Link href="/?tab=analiza" className="underline">vezi live</Link></p>}
      </div>
      <JobQueue initial={plain(await jobQueue(userId))} />
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
              {slotById(j.slot)?.title ?? (j.slot.startsWith('CUSTOM_') ? 'CUSTOM' : j.slot)} · {STATUS_RO[j.status]} · {fmtDateTime(j.created_at.toISOString())}
            </Link>
          ))}
        </div>
      )}
      <NexusLive key={jobId} jobId={jobId} initialMeta={plain(meta)} initialEvents={plain(events)} />
    </div>
  );
}

async function agentCards(): Promise<AgentCard[]> {
  const a = await activeAssignments().catch(() => new Map());
  const records = new Map((await allTrackRecords(VOTING_AGENTS.map((x) => x.id)).catch(() => [])).map((r) => [r.id, r.record]));
  return VOTING_AGENTS.map((x) => {
    const r = records.get(x.id);
    return { id: x.id, name: x.name, title: x.title, specialty: x.specialty, risk: x.risk, maxOdds: x.maxOdds, minProbability: x.minProbability, model: a.get(x.id)?.primary?.model ?? null, record: r && r.decided >= 3 ? `${r.won}/${r.decided} verzi` : null };
  });
}

const CUSTOM_STATUS: Record<string, string> = { QUEUED: 'în coadă', RUNNING: 'live', WAITING: 'așteaptă', PAUSED: 'pauză', COMPLETED: 'gata', INCOMPLETE: 'incomplet', NO_BET: 'NO BET', FAILED: 'eșuat' };

async function CustomTab({ userId, job }: { userId: string; job?: string }) {
  const cards = await agentCards();
  if (job && UUID.test(job)) {
    const meta = await jobMeta(userId, job);
    if (meta) {
      const events = (await jobEvents(userId, job, 0)) ?? [];
      const info = Object.fromEntries(cards.map((c) => [c.id, { title: c.title, specialty: c.specialty, maxOdds: c.maxOdds, minProbability: c.minProbability, model: c.model }]));
      return <CustomLive key={job} jobId={job} initialMeta={plain(meta)} initialEvents={plain(events)} info={info} />;
    }
  }
  const recent = await customJobs(userId, 12);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Bilet custom</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Tu alegi cota, numărul de meciuri și cine intră în teren. Agenții aleși analizează și dezbat live pe hartă, iar jurnalul de sub hartă arată tot ce și-au spus. Maximum 10 bilete custom pe zi.</p>
      </div>
      <JobQueue initial={plain(await jobQueue(userId))} />
      <CustomForm agents={cards} />
      {recent.length > 0 && (
        <section>
          <h3 className="mb-2 font-display text-lg font-bold">Biletele tale custom</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((j) => {
              const c = j.config.custom;
              const tone = j.outcome_status === 'WON' ? 'border-emerald/60' : j.outcome_status === 'LOST' ? 'border-rose/60' : '';
              return (
                <Link key={j.id} href={`/?tab=custom&job=${j.id}`} className={`card-soft flex items-center gap-3 p-3 hover:border-cyan/50 ${tone}`}>
                  <div className="flex -space-x-2">{(c?.agents ?? []).slice(0, 4).map((a) => <img key={a} src={`/agents/${a}.webp`} alt="" className="h-7 w-7 rounded-full border-2 border-ink object-cover" />)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Cotă {Number(j.target_odds)} · {j.required_legs} meciuri{j.actual_odds ? <span className="text-emerald"> → {Number(j.actual_odds).toFixed(2)}</span> : null}</p>
                    <p className="text-xs text-muted">{fmtDateTime(j.created_at.toISOString())} · {(c?.agents ?? []).length} agenți</p>
                  </div>
                  <span className="chip text-muted">{j.outcome_status === 'WON' ? 'câștigat' : j.outcome_status === 'LOST' ? 'pierdut' : CUSTOM_STATUS[j.status] ?? j.status}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

async function VerificaTab({ userId, job }: { userId: string; job?: string }) {
  if (job && UUID.test(job)) {
    const meta = await jobMeta(userId, job);
    if (meta) {
      const cards = await agentCards();
      const events = (await jobEvents(userId, job, 0)) ?? [];
      const info = Object.fromEntries(cards.map((c) => [c.id, { title: c.title, specialty: c.specialty, maxOdds: c.maxOdds, minProbability: c.minProbability, model: c.model }]));
      return <CustomLive key={job} jobId={job} initialMeta={plain(meta)} initialEvents={plain(events)} info={info} back={{ href: '/?tab=verifica', label: '← Alt bilet la analiză' }} />;
    }
  }
  const recent = await reviewJobs(userId, 9);
  return (
    <div className="space-y-6 pb-16 lg:pb-0">
      <div>
        <h1 className="font-display text-2xl font-bold">Vino cu biletul tău la analiză</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Îți faci biletul din meciurile cu cote reale, le lași tacticienilor sfaturile tale și îl trimiți la analiză. Cei 12 agenți îl dezbat live pe hartă, îți spun ce meci e solid, riscant sau slab, ce să înlocuiești, iar Mircea Lucescu îți dă verdictul final. Biletul rămâne salvat și îl urmărim verde/roșu până la final.</p>
      </div>
      <JobQueue initial={plain(await jobQueue(userId))} />
      <ReviewBuilder />
      {recent.length > 0 && (
        <section>
          <h3 className="mb-2 font-display text-lg font-bold">Biletele tale analizate</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((j) => {
              const r = j.summary?.review;
              const tone = j.outcome_status === 'WON' ? 'border-emerald/60' : j.outcome_status === 'LOST' ? 'border-rose/60' : '';
              return (
                <Link key={j.id} href={`/?tab=verifica&job=${j.id}`} className={`card-soft flex items-center gap-3 p-3 hover:border-cyan/50 ${tone}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Cotă {Number(j.target_odds)} · {j.required_legs} meciuri</p>
                    <p className="text-xs text-muted">{fmtDateTime(j.created_at.toISOString())}{r ? ` · ✓${r.solid} ⚠${r.risky} ✗${r.weak}` : ''}</p>
                  </div>
                  <span className="chip text-muted">{j.outcome_status === 'WON' ? 'câștigat' : j.outcome_status === 'LOST' ? 'pierdut' : CUSTOM_STATUS[j.status] ?? j.status}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
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
