import { describeModel } from '@/lib/model-identities';
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Activity, BarChart3, History, House, ListOrdered, SlidersHorizontal, Ticket } from 'lucide-react';
import { MatchesView } from '@/components/matches/matches-view';
import { currentUser, googleConfigured } from '@/lib/auth';
import { PublicHome } from '@/components/home/public-home';
import { ResultsRefresh } from '@/components/results-refresh';
import { FeedbackButton } from '@/components/feedback-button';
import { many, one, timeCompare, SQL_NOW } from '@/lib/db';
import { jobEvents, jobMeta, listTickets, ticketDetail } from '@/lib/views';
import { TicketView, type TicketData } from '@/components/ticket-view';
import { TicketArchive } from '@/components/ticket-archive';
import { NexusLive } from '@/components/nexus-live';
import { ReplayPlayer } from '@/components/replay-player';
import { PerformancePanel } from '@/components/performance-panel';
import { AGENT_META, STATUS_RO, fmtDateTime } from '@/lib/format';
import { CUSTOM_LIMIT_PER_DAY, slotById } from '@/lib/slots';
import { VOTING_AGENTS } from '@/lib/ai/agents';
import { activeAssignments } from '@/lib/ai/assignments';
import { allTrackRecords } from '@/lib/track-record';
import { customJobs, jobQueue } from '@/lib/jobs/service';
import { homeThreads } from '@/lib/home-reel';
import { HomeIntro, HowItWorks } from '@/components/home/home-intro';
import { StatsView } from '@/components/stats-view';
import { AutomationPanel } from '@/components/automation-panel';
import { automationHealth } from '@/lib/automation';
import { agentStats, agentRanking, currentMonth } from '@/lib/agent-stats';
import { TabLink } from '@/components/tab-link';
import { TabLoading } from '@/components/tab-loading';
import { JobQueue } from '@/components/job-queue';
import { CustomForm, type AgentCard } from '@/components/custom/custom-form';
import { CustomLive } from '@/components/custom/custom-live';
import { localDate } from '@/lib/time';
import { topSixAgentIds } from '@/lib/agent-ranking';
import { databaseIssue } from '@/lib/database-availability';
import { canRemoveTickets } from '@/lib/ticket-removal';

export const dynamic = 'force-dynamic';

type Tab = 'acasa' | 'custom' | 'analiza' | 'istoric' | 'statistici' | 'meciuri';
const UUID = /^[0-9a-f-]{36}$/;
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** PRIMUL 11 — public introduction and authenticated application sections. */
export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string; ticket?: string; job?: string; replay?: string; fresh?: string; scope?: string; luna?: string; vedere?: string }> }) {
  let user;
  try { user = await currentUser(); }
  catch (error) {
    if (databaseIssue(error) === 'quota') return <PublicHome google={googleConfigured()} unavailable />;
    throw error;
  }
  const sp = await searchParams;
  if (!user) {
    if ((sp.tab && sp.tab !== 'acasa') || sp.ticket || sp.job || sp.replay) redirect('/login');
    return <PublicHome google={googleConfigured()} />;
  }
  // Old daily-ticket URLs remain readable through the shared archive.
  const tab: Tab = !sp.tab && !sp.ticket && !sp.job && !sp.replay ? 'acasa' : sp.tab === 'verifica' ? 'acasa' : sp.tab === 'acasa' || sp.tab === 'analiza' || sp.tab === 'custom' || sp.tab === 'statistici' || sp.tab === 'meciuri' ? sp.tab : 'istoric'; // "Biletul tău" was removed (27.10); old links land on Acasă
  const running = await many<{ id: string; slot: string; status: string; created_at: Date }>(
    "SELECT id, slot, status, created_at FROM ticket_generation_jobs WHERE user_id=$1 AND status IN ('QUEUED','RUNNING','WAITING','PAUSED') ORDER BY created_at DESC", [user.id]);
  // When the OpenRouter account runs out of credits the agents fall back to slow free models: say so plainly.
  const creditsOut = await one<{ n: number }>(
    `SELECT count(*) AS n FROM model_health WHERE model_key='openrouter:*' AND ${timeCompare('exhausted_until', '>', SQL_NOW())}`).catch(() => null);
  const slowAi = (creditsOut?.n ?? 0) > 0;

  const tabs: Array<{ id: Tab; label: string; icon: typeof Ticket; badge?: boolean }> = [
    { id: 'acasa', label: 'Acasă', icon: House },
    { id: 'istoric', label: 'Bilete create', icon: History },
    { id: 'custom', label: 'Custom', icon: SlidersHorizontal, badge: running.some((j) => j.slot.startsWith('CUSTOM_')) },
    { id: 'analiza', label: 'Analiză', icon: Activity, badge: running.length > 0 },
    { id: 'meciuri', label: 'Meciuri', icon: ListOrdered },
    { id: 'statistici', label: 'Statistici', icon: BarChart3 },
  ];

  return (
    <>
      {['acasa', 'istoric', 'statistici'].includes(tab) && <ResultsRefresh />}
      <header className="app-header">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4">
          <Link href="/" aria-label="Acasă" className="flex items-center gap-2.5 py-3">
            <img src="/logo.svg" alt="" className="h-8 w-8" />
            <span className="app-wordmark">PRIMUL <b>11</b></span>
            <span className="rounded border border-gold/50 px-1.5 py-px text-[10px] font-semibold text-gold">beta</span>
          </Link>
          <nav className="app-tabs md:ml-auto" aria-label="Secțiuni">
            {tabs.map(({ id, label, icon: Icon, badge }) => (
              <TabLink key={id} href={`/?tab=${id}`} label={label} active={tab === id}>
                <Icon size={17} aria-hidden /> <span className="md:hidden">{label.split(' ')[0]}</span><span className="hidden lg:inline">{label}</span>
                {badge && <span className="app-tab-dot" aria-label="analiză în curs" />}
              </TabLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 md:ml-2">
            {user.role === 'admin' && <Link href="/admin/invitations" className="text-xs text-muted hover:text-text" title="Conturi și coduri de acces">Conturi</Link>}
            {user.role === 'admin' && <Link href="/admin/feedback" className="text-xs text-muted hover:text-text" title="Ideile trimise de utilizatori">Sugestii</Link>}
            <form action="/auth/logout" method="post"><button className="text-xs text-muted hover:text-text">Ieșire</button></form>
          </div>
        </div>
      </header>

      {slowAi && <div role="status" className="mx-auto mt-3 max-w-6xl px-4"><p className="rounded-xl border border-gold/50 bg-gold/10 px-4 py-2.5 text-sm text-gold">
        {user.role === 'admin' ? 'Creditele OpenRouter s-au terminat: agenții lucrează acum pe modelele gratuite de rezervă (Gemini, Groq) — merge, dar mai încet. Încarcă credite pe openrouter.ai → Credits și modelele plătite revin singure în cel mult 30 de minute.' : 'Analizele merg mai încet acum; biletele în lucru se completează singure, poți închide pagina.'}
      </p></div>}
      <main className="app-main mx-auto max-w-6xl px-4 pb-24 pt-8">
        <Suspense key={[tab,sp.ticket,sp.job,sp.replay,sp.luna,sp.scope,sp.fresh].join(':')} fallback={<TabLoading tab={tab} />}>
        {tab === 'acasa' && <AcasaTab userId={user.id} />}
        {tab === 'custom' && <CustomTab userId={user.id} job={sp.job} />}
        {tab === 'analiza' && <AnalizaTab userId={user.id} job={sp.job} replay={sp.replay} running={running} />}
        {tab === 'meciuri' && <MatchesView />}
        {tab === 'statistici' && <StatisticiTab userId={user.id} admin={user.role === 'admin'} month={sp.luna} scope={sp.scope} />}
        {tab === 'istoric' && <IstoricTab userId={user.id} ticket={sp.ticket} fresh={sp.fresh === '1'} admin={user.role === 'admin'} canRemove={canRemoveTickets(user)} />}
        </Suspense>
      </main>
      <footer className="app-footer mx-auto max-w-6xl space-y-1 px-4 pb-28 md:pb-10"><p>Rezultatele și scorurile live de pe bilete se actualizează automat la 10 minute.</p><p>18+ · Analizele nu garantează rezultatele și nu plasează pariuri. Joacă responsabil.</p></footer>
      <FeedbackButton />
    </>
  );
}

async function AcasaTab({ userId }: { userId: string }) {
  const [frag, queue, assignments] = await Promise.all([
    homeThreads(userId, 'community'), jobQueue(userId), activeAssignments(),
  ]);
  const models = Object.fromEntries([...assignments].map(([id, a]) => [id, a.primary.model]));
  return <div className="home-page">
    <HomeIntro signedIn thread={frag.threads[0] ? plain(frag.threads[0]) : undefined} models={models} />
    {queue.length > 0 && <div className="mt-8"><JobQueue initial={plain(queue)} /></div>}
    <HowItWorks />
    <nav aria-label="Ce vrei să faci" className="home-shortcuts">
      <Link href="/?tab=custom"><SlidersHorizontal size={22} aria-hidden /><div><h2>Creează bilet custom</h2><p>Alegi cota și meciurile. Urmărești cum decide echipa.</p></div></Link>
      <Link href="/?tab=statistici"><BarChart3 size={22} aria-hidden /><div><h2>Cunoaște agenții</h2><p>Modele, stiluri, verzi și roșii. Rezultatele rămân la vedere.</p></div></Link>
    </nav>
  </div>;
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

async function AnalizaTab({ userId, job, replay, running }: { userId: string; job?: string; replay?: string; running: Array<{ id: string; slot: string; status: string; created_at: Date }> }) {
  if (replay && UUID.test(replay)) {
    const t = await ticketDetail(userId, replay);
    if (t) {
      const meta = await jobMeta(userId, t.jobId);
      const events = (await jobEvents(userId, t.jobId, 0)) ?? [];
      if (meta) return <CustomLive key={`r-${t.jobId}`} jobId={t.jobId} initialMeta={plain(meta)} initialEvents={plain(events)} info={await agentInfo()} back={{ href: `/?tab=istoric&ticket=${t.id}`, label: '← Înapoi la bilet' }} replayOnOpen />;
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
        <p className="mt-2 text-muted">Nicio analiză disponibilă. Poți consulta biletele deja salvate.</p>
        <Link href="/?tab=istoric" className="btn btn-primary mt-5 px-6 py-3">Mergi la bilete</Link>
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
  const [a, rows] = await Promise.all([activeAssignments().catch(() => new Map()), allTrackRecords(VOTING_AGENTS.map((x) => x.id)).catch(() => [])]);
  const records = new Map(rows.map((r) => [r.id, r.record]));
  return VOTING_AGENTS.map((x) => {
    const r = records.get(x.id);
    return { id: x.id, name: describeModel(a.get(x.id)?.primary?.model).modelName, title: x.title, specialty: x.specialty, risk: x.risk, maxOdds: x.maxOdds, minProbability: x.minProbability, model: a.get(x.id)?.primary?.model ?? null, record: r && r.decided >= 3 ? `${r.won}/${r.decided} verzi` : null };
  });
}

const CUSTOM_STATUS: Record<string, string> = { QUEUED: 'în coadă', RUNNING: 'live', WAITING: 'așteaptă', PAUSED: 'pauză', COMPLETED: 'gata', INCOMPLETE: 'incomplet', NO_BET: 'NO BET', FAILED: 'eșuat' };

async function CustomTab({ userId, job }: { userId: string; job?: string }) {
  if (job && UUID.test(job)) {
    const meta = await jobMeta(userId, job);
    if (meta) {
      const [cards, rows] = await Promise.all([agentCards(), jobEvents(userId, job, 0)]);
      const events = rows ?? [];
      const info = Object.fromEntries(cards.map((c) => [c.id, { title: c.title, specialty: c.specialty, maxOdds: c.maxOdds, minProbability: c.minProbability, model: c.model }]));
      return <CustomLive key={job} jobId={job} initialMeta={plain(meta)} initialEvents={plain(events)} info={info} />;
    }
  }
  const [cards, recent, ranking] = await Promise.all([agentCards(), customJobs(userId, CUSTOM_LIMIT_PER_DAY), agentRanking()]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Bilet custom</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Alege cota, meciurile, ligile și agenții, apoi câte bilete vrei să creeze echipa. Am pregătit o echipă de 5 agenți; poți ajusta toate setările înainte de pornire. Maximum {CUSTOM_LIMIT_PER_DAY} bilete custom pe zi.</p>
      </div>
      <CustomForm agents={cards} topAgentIds={topSixAgentIds(ranking)} remaining={Math.max(0, CUSTOM_LIMIT_PER_DAY - recent.filter((j) => j.period_key === localDate()).length)} />
      {recent.length > 0 && (
        <section>
          <h3 className="mb-2 font-display text-lg font-bold">Biletele tale custom</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((j) => {
              const c = j.config.custom;
              const tone = j.outcome_status === 'WON' ? 'border-emerald/60' : j.outcome_status === 'LOST' ? 'border-rose/60' : '';
              return (
                <Link key={j.id} href={`/?tab=custom&job=${j.id}`} className={`card-soft flex items-center gap-3 p-3 hover:border-cyan/50 ${tone}`}>
                  <div className="flex -space-x-2">{(c?.agents ?? []).slice(0, 4).map((a) => <img key={a} src={AGENT_META[a]?.img} alt="" className="h-7 w-7 rounded-full border-2 border-ink object-cover" />)}</div>
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

async function StatisticiTab({ userId, admin, month, scope }: { userId: string; admin: boolean; month?: string; scope?: string }) {
  const m = month === 'all' || /^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '') ? month! : currentMonth();
  const selected = scope === 'mine' ? 'mine' : 'all';
  const [{ agents, totals }, automation] = await Promise.all([agentStats(userId, admin, m, selected), admin ? automationHealth() : null]);
  return <div className="space-y-6">{automation && <AutomationPanel initial={plain(automation)} />}<StatsView agents={agents} totals={totals} month={m} scope={selected} /></div>;
}

async function IstoricTab({ userId, ticket, fresh, admin = false, canRemove = false }: { userId: string; ticket?: string; fresh: boolean; admin?: boolean; canRemove?: boolean }) {
  if (ticket) return <TicketPanel userId={userId} id={ticket} fresh={fresh} back="/?tab=istoric" />;
  const tickets = await listTickets(userId);
  return (
    <div className="space-y-10">
      <TicketArchive tickets={JSON.parse(JSON.stringify(tickets))} canRemove={canRemove} />
      <PerformancePanel />
    </div>
  );
}
