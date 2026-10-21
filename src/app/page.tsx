import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Activity, BarChart3, CalendarDays, ClipboardCheck, History, ListOrdered, SlidersHorizontal, Ticket } from 'lucide-react';
import { MatchesView } from '@/components/matches/matches-view';
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
import { CUSTOM_LIMIT_PER_DAY, slotById } from '@/lib/slots';
import { VOTING_AGENTS } from '@/lib/ai/agents';
import { activeAssignments } from '@/lib/ai/assignments';
import { allTrackRecords } from '@/lib/track-record';
import { customJobs, jobQueue, reviewJobs } from '@/lib/jobs/service';
import { ReviewBuilder } from '@/components/review/review-builder';
import { HomeStage } from '@/components/home/home-stage';
import { homeReel, homeStats, homeThreads } from '@/lib/home-reel';
import { HomeThreads } from '@/components/home/home-threads';
import { StatsView } from '@/components/stats-view';
import { agentStats, currentMonth } from '@/lib/agent-stats';
import { JobQueue } from '@/components/job-queue';
import { CustomForm, type AgentCard } from '@/components/custom/custom-form';
import { CustomLive } from '@/components/custom/custom-live';

export const dynamic = 'force-dynamic';

type Tab = 'acasa' | 'bilete' | 'custom' | 'verifica' | 'analiza' | 'azi' | 'istoric' | 'statistici' | 'meciuri';
const UUID = /^[0-9a-f-]{36}$/;
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** PRIMUL 11 — the whole app on one page, organised in three tabs. */
export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string; ticket?: string; job?: string; replay?: string; fresh?: string; luna?: string }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const sp = await searchParams;
  const tab: Tab = sp.tab === 'analiza' || sp.tab === 'istoric' || sp.tab === 'custom' || sp.tab === 'verifica' || sp.tab === 'bilete' || sp.tab === 'statistici' || sp.tab === 'azi' || sp.tab === 'meciuri' ? sp.tab : sp.ticket ? 'bilete' : 'acasa';
  const running = await many<{ id: string; slot: string; status: string; created_at: Date }>(
    "SELECT id, slot, status, created_at FROM ticket_generation_jobs WHERE user_id=$1 AND status IN ('QUEUED','RUNNING','WAITING','PAUSED') ORDER BY created_at DESC", [user.id]);

  const tabs: Array<{ id: Tab; label: string; icon: typeof Ticket; badge?: boolean }> = [
    { id: 'bilete', label: 'Bilete', icon: Ticket },
    { id: 'custom', label: 'Custom', icon: SlidersHorizontal, badge: running.some((j) => j.slot.startsWith('CUSTOM_')) },
    { id: 'verifica', label: 'Biletul tău', icon: ClipboardCheck, badge: running.some((j) => j.slot.startsWith('REVIEW_')) },
    { id: 'analiza', label: 'Analiză', icon: Activity, badge: running.length > 0 },
    { id: 'azi', label: 'Azi', icon: CalendarDays },
    { id: 'meciuri', label: 'Meciuri', icon: ListOrdered },
    { id: 'istoric', label: 'Istoric', icon: History },
    { id: 'statistici', label: 'Statistici', icon: BarChart3 },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" aria-label="Acasă" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
            <img src="/logo.svg" alt="" className="h-9 w-9" />
            <span className="hidden sm:inline">PRIMUL <span className="text-cyan">11</span></span>
            <span className="rounded-md border border-gold/60 bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gold">Beta</span>
          </Link>
          <nav className="order-last flex w-full justify-center gap-1 rounded-xl border border-line bg-panel p-1 sm:order-none sm:ml-auto sm:w-auto" aria-label="Secțiuni">
            {tabs.map(({ id, label, icon: Icon, badge }) => (
              <Link key={id} href={`/?tab=${id}`} title={label} aria-label={label} aria-current={tab === id ? 'page' : undefined}
                className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition md:px-4 ${tab === id ? 'bg-cyan/15 text-cyan' : 'text-muted hover:text-text'}`}>
                <Icon size={16} aria-hidden /> <span className="hidden xl:inline">{label}</span>
                {badge && <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-emerald" aria-label="analiză în curs" />}
              </Link>
            ))}
          </nav>
          {user.role === 'admin' && <Link href="/admin/invitations" className="text-xs text-cyan" title="Coduri de invitație">Invitații</Link>}
          <form action="/auth/logout" method="post"><button className="text-xs text-muted hover:text-text">Ieșire</button></form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        {tab === 'acasa' && <AcasaTab userId={user.id} />}
        {tab === 'bilete' && <BileteTab userId={user.id} ticket={sp.ticket} fresh={sp.fresh === '1'} running={running.length} />}
        {tab === 'custom' && <CustomTab userId={user.id} job={sp.job} />}
        {tab === 'verifica' && <VerificaTab userId={user.id} job={sp.job} />}
        {tab === 'analiza' && <AnalizaTab userId={user.id} job={sp.job} replay={sp.replay} running={running} />}
        {tab === 'meciuri' && <MatchesView />}
        {tab === 'azi' && <AziTab userId={user.id} ticket={sp.ticket} />}
        {tab === 'statistici' && <StatisticiTab userId={user.id} admin={user.role === 'admin'} month={sp.luna} />}
        {tab === 'istoric' && <IstoricTab userId={user.id} ticket={sp.ticket} />}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted">18+ · Analizele nu garantează rezultatele și nu plasează pariuri. Joacă responsabil.</footer>
    </>
  );
}

async function AcasaTab({ userId }: { userId: string }) {
  const [reel, stats, slots, queue, frag] = await Promise.all([homeReel(userId), homeStats(userId), slotStates(userId), jobQueue(userId), homeThreads(userId)]);
  const ready = slots.filter((x) => x.ticket).length;
  const decided = stats.legsWon + stats.legsLost;
  const tiles: Array<{ href: string; title: string; text: string; foot: string; accent: string; icon: typeof Ticket; wide?: boolean }> = [
    { href: '/?tab=bilete', title: 'Biletele zilei', text: 'COTĂ 5 și COTĂ 2, câte două pe zi, plus biletul săptămânii, construite din cote mici.', foot: ready ? `${ready} din ${slots.length} gata azi` : 'Niciunul creat încă azi', accent: '#5ee7f7', icon: Ticket, wide: true },
    { href: '/?tab=custom', title: 'Creează bilet', text: 'Alegi cota, câte meciuri și cine intră în teren, apoi urmărești dezbaterea pe hartă.', foot: `Până la ${CUSTOM_LIMIT_PER_DAY} bilete custom pe zi`, accent: '#34d399', icon: SlidersHorizontal, wide: true },
    { href: '/?tab=verifica', title: 'Vino cu biletul tău la analiză', text: 'Îți faci biletul din cote reale; echipa îți spune ce e solid, ce e slab și ce să schimbi.', foot: 'Verdict pe fiecare meci', accent: '#e8c26a', icon: ClipboardCheck },
    { href: '/?tab=istoric', title: 'Bilete create', text: 'Toate biletele, cu meciurile ieșite verzi sau roșii și cum a fost luată fiecare decizie.', foot: stats.tickets ? `${stats.tickets} ${stats.tickets === 1 ? 'bilet' : 'bilete'}${decided ? `, ${stats.legsWon} din ${decided} meciuri verzi` : ''}` : 'Încă niciun bilet', accent: '#a78bfa', icon: History },
  ];
  return (
    <div className="space-y-10">
      {reel && reel.events.length > 10 ? <HomeStage events={plain(reel.events)} title={reel.title} finishedAt={reel.finishedAt} target={Number(reel.events.find((e) => e.type === 'TARGET_SELECTED')?.payload.target ?? 0)} />
        : <div className="py-10"><h1 className="font-display text-5xl font-bold leading-none tracking-tight">Analizează.<br />Dezbate.<br />Decide.</h1><p className="mt-4 max-w-md text-muted">Prima analiză apare aici ca reluare imediat ce se încheie.</p></div>}
      <nav aria-label="Ce vrei să faci" className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_1fr_1fr]">
        {tiles.map(({ href, title, text, foot, accent, icon: Icon }) => (
          <Link key={href} href={href} className="group relative flex min-h-[188px] flex-col overflow-hidden rounded-[1.4rem] border border-line bg-panel/70 p-5 transition-colors hover:border-[color:var(--a)] focus-visible:border-[color:var(--a)]" style={{ ['--a' as string]: accent }}>
            <span className="absolute inset-x-0 top-0 h-1 origin-left scale-x-[.18] transition-transform duration-300 group-hover:scale-x-100" style={{ background: accent }} aria-hidden />
            <Icon size={22} style={{ color: accent }} aria-hidden />
            <h2 className="mt-4 font-display text-[1.45rem] font-bold leading-tight tracking-tight">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
            <p className="mt-auto pt-4 text-xs font-semibold" style={{ color: accent }}>{foot}</p>
          </Link>
        ))}
      </nav>
      <HomeThreads threads={plain(frag.threads)} news={frag.news ? plain(frag.news) : null} />
      {queue.length > 0 && <JobQueue initial={plain(queue)} />}
    </div>
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
        <p className="max-w-2xl text-sm text-muted">Apasă <strong className="text-text">CREEAZĂ BILETUL</strong>: cei 22 de agenți analizează meciurile de azi și mâine, votează și construiesc biletul din cote mici. Urmărești totul în fila <Link href="/?tab=analiza" className="text-cyan">Analiză</Link>.</p>
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
      const meta = await jobMeta(userId, t.jobId);
      const events = (await jobEvents(userId, t.jobId, 0)) ?? [];
      if (meta) return <CustomLive key={`r-${t.jobId}`} jobId={t.jobId} initialMeta={plain(meta)} initialEvents={plain(events)} info={await agentInfo()} back={{ href: `/?tab=bilete&ticket=${t.id}`, label: '← Înapoi la bilet' }} replayOnOpen />;
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
      <CustomLive key={jobId} jobId={jobId} initialMeta={plain(meta)} initialEvents={plain(events)} info={await agentInfo()} back={null} openTicketWhenDone />
    </div>
  );
}

async function agentInfo() {
  const cards = await agentCards();
  return Object.fromEntries(cards.map((c) => [c.id, { title: c.title, specialty: c.specialty, maxOdds: c.maxOdds, minProbability: c.minProbability, model: c.model }]));
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
        <p className="mt-1 max-w-2xl text-sm text-muted">Tu alegi cota, numărul de meciuri și cine intră în teren. Agenții aleși analizează și dezbat live pe hartă, iar jurnalul de sub hartă arată tot ce și-au spus. Maximum {CUSTOM_LIMIT_PER_DAY} bilete custom pe zi.</p>
      </div>
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
        <p className="mt-1 max-w-2xl text-sm text-muted">Îți faci biletul din meciurile cu cote reale, le lași tacticienilor sfaturile tale și îl trimiți la analiză. Cei 22 de agenți îl dezbat live pe hartă, îți spun ce meci e solid, riscant sau slab, ce să înlocuiești, iar Mircea Lucescu îți dă verdictul final. Biletul rămâne salvat și îl urmărim verde/roșu până la final.</p>
      </div>
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

async function AziTab({ userId, ticket }: { userId: string; ticket?: string }) {
  if (ticket) return <TicketPanel userId={userId} id={ticket} fresh={false} back="/?tab=azi" />;
  const tickets = await listTickets(userId);
  return <TicketArchive tickets={JSON.parse(JSON.stringify(tickets))} initialFilter="today" title="Bilete create azi" />;
}

async function StatisticiTab({ userId, admin, month }: { userId: string; admin: boolean; month?: string }) {
  const m = month === 'all' || /^\d{4}-\d{2}$/.test(month ?? '') ? month! : currentMonth();
  const { agents, totals } = await agentStats(userId, admin, m);
  return <StatsView agents={plain(agents)} totals={totals} month={m} />;
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
