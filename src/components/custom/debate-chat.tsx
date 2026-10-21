'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AGENT_META } from '@/lib/format';
import type { NexusEvent } from '@/lib/nexus-state';

type Msg =
  | { kind: 'agent'; seq: number; at: string; agent: string; fixture: string | null; tone: 'pick' | 'nobet' | 'objection' | 'revised' | 'news' | 'brain' | 'failed'; head: string; body?: string; chips?: Array<{ text: string; tone?: 'main' | 'alt' | 'good' | 'bad' }>; links?: Array<{ title: string; href?: string; source?: string }> }
  | { kind: 'system'; seq: number; at: string; fixture: string | null; tone: 'info' | 'good' | 'bad' | 'warn'; text: string };

const pct = (p: unknown) => (typeof p === 'number' ? `${Math.round(p * 100)}%` : null);
const time = (iso: string) => new Date(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Turns recorded events into chat messages — only what agents actually wrote, nothing invented. */
export function eventsToMessages(events: NexusEvent[]): { messages: Msg[]; matches: Record<string, string> } {
  const matches: Record<string, string> = {};
  const out: Msg[] = [];
  for (const e of events) {
    const p = e.payload ?? {};
    if (e.fixtureId && p.match) matches[e.fixtureId] = p.match;
    if (e.type === 'CANDIDATE_SELECTED') for (const o of p.order ?? []) matches[o.fixtureId] = o.match;
    const base = { seq: e.seq, at: e.createdAt, fixture: e.fixtureId };
    const sys = (text: string, tone: 'info' | 'good' | 'bad' | 'warn' = 'info') => out.push({ kind: 'system', ...base, tone, text });
    switch (e.type) {
      case 'JOB_CREATED': sys(p.review ? `Biletul tău a venit la analiză: ${(p.review.legs ?? []).map((l: { match: string; label: string; odds: number }) => `${l.match} — ${l.label} @ ${Number(l.odds).toFixed(2)}`).join(' · ')}` : p.custom ? `Bilet custom: cotă ${p.custom.target} din ${p.custom.legs} ${p.custom.legs === 1 ? 'meci' : 'meciuri'} ${p.custom.leagues?.length ? ` · ${p.custom.leagues.length} ${p.custom.leagues.length === 1 ? 'ligă aleasă' : 'ligi alese'}` : ''} · în teren: ${(p.custom.names ?? []).join(', ')}` : `Analiză pornită: ${p.title}`); break;
      case 'POOL_BUILT': sys(`${p.totalFixtures} meciuri găsite, ${p.eligible} eligibile.`); break;
      case 'MARKETS_CHECKED': sys(`${p.accepted} meciuri au minimum ${p.minimum} pronosticuri cu cotă reală; ${p.rejected} lăsate deoparte.`); break;
      case 'BATCH_STARTED': sys(`Lotul ${p.batch}/${p.of} intră la discuție: ${(p.fixtures ?? []).map((f: string) => matches[f] ?? f).join(' · ')}`); break;
      case 'NEWS_COLLECTED': out.push({ kind: 'agent', ...base, agent: 'hantu', tone: 'news', head: `${(p.home ?? 0) + (p.away ?? 0)} știri despre ${p.match}`, links: (p.headlines ?? []).slice(0, 3).map((h: { title: string; link?: string; source?: string }) => ({ title: h.title, href: h.link, source: h.source })) }); break;
      case 'PREDICTION_SAVED': {
        const bet = p.decision === 'BET_CANDIDATE';
        const chips: Array<{ text: string; tone?: 'main' | 'alt' }> = [];
        if (bet) chips.push({ text: `${p.marketLabel ?? p.marketKey}${p.odds ? ` @ ${Number(p.odds).toFixed(2)}` : ''}${pct(p.estimatedProbability) ? ` · ${pct(p.estimatedProbability)}` : ''}`, tone: 'main' });
        for (const a of p.alternatives ?? []) chips.push({ text: `alt: ${a.label}${a.odds ? ` @ ${Number(a.odds).toFixed(2)}` : ''}`, tone: 'alt' });
        out.push({ kind: 'agent', ...base, agent: e.agentId!, tone: bet ? 'pick' : 'nobet', head: bet ? 'propune' : 'NO BET', body: p.rationale, chips });
        break;
      }
      case 'OBJECTION_RECORDED': out.push({ kind: 'agent', ...base, agent: e.agentId!, tone: 'objection', head: `obiecție · runda ${p.round}`, body: p.objection }); break;
      case 'POSITION_REVISED': out.push({ kind: 'agent', ...base, agent: e.agentId!, tone: 'revised', head: p.changed ? 'își schimbă poziția' : 'își menține poziția', body: p.response || p.rationale, chips: [{ text: p.decision === 'BET_CANDIDATE' ? p.marketLabel ?? p.marketKey : 'NO BET', tone: 'main' }] }); break;
      case 'AGENT_FAILED': out.push({ kind: 'agent', ...base, agent: e.agentId ?? 'scout', tone: 'failed', head: 'indisponibil', body: `${p.error ?? ''} ${p.consequence ?? ''}`.trim() }); break;
      case 'DEBATE_STARTED': sys(`Dezbatere runda ${p.round}: ${(p.fixtures ?? []).map((f: string) => matches[f] ?? f).join(' · ') || 'meciurile disputate'}`, 'warn'); break;
      case 'DEBATE_SKIPPED': sys(`Fără dezbatere (runda ${p.round}): ${p.reason}`); break;
      case 'BRAIN_STARTED': sys(`🧠 Creierul echipei alege pronosticul ideal pentru ${p.fixtures} meciuri.`, 'warn'); break;
      case 'BRAIN_DECISION': out.push({ kind: 'agent', ...base, agent: 'robert', tone: 'brain', head: p.choice ? `🧠 aleg „${p.label}”${p.odds ? ` @ ${Number(p.odds).toFixed(2)}` : ''}` : '🧠 resping lista scurtă', body: p.reason, chips: (p.shortlist ?? []).map((s: { key: string; label: string; odds: number }) => ({ text: `${s.label}${s.odds ? ` @ ${Number(s.odds).toFixed(2)}` : ''}`, tone: s.key === p.choice ? 'good' : 'alt' })) }); break;
      case 'VOTE_SET_ASIDE': sys(`${AGENT_META[e.agentId ?? '']?.name ?? 'Agent'}: vot nenumărat (${p.marketLabel ?? p.marketKey}) — ${p.reason}`, 'warn'); break;
      case 'CONSENSUS_CALCULATED': sys(`${p.match}: ${p.outcome === 'QUALIFIED' ? `consens ${p.votesFor}/${p.total}` : p.outcome === 'NO_BET' ? `NO BET (${p.noBetVotes}/${p.total})` : `fără consens (max ${p.votesFor}/${p.total})`}`, p.outcome === 'QUALIFIED' ? 'good' : 'info'); break;
      case 'SELECTION_ACCEPTED': sys(`✓ Pe bilet: ${p.match} — ${p.marketLabel} @ ${Number(p.odds).toFixed(2)}`, 'good'); break;
      case 'SELECTION_REJECTED': sys(`✗ ${p.match}: ${p.reason ?? 'respins'}`, 'bad'); break;
      case 'LEG_REVIEWED': sys(`${p.verdict === 'SOLID' ? '✓ SOLID' : p.verdict === 'RISCANT' ? '⚠ RISCANT' : '✗ SLAB'} · ${p.match} — „${p.label}” @ ${Number(p.odds).toFixed(2)}: ${p.note}`, p.verdict === 'SOLID' ? 'good' : p.verdict === 'RISCANT' ? 'warn' : 'bad'); break;
      case 'REVIEW_ADVICE': out.push({ kind: 'agent', ...base, agent: 'robert', tone: 'brain', head: '🧠 verdictul pentru biletul tău', body: [p.overall, ...(p.advice ?? []).map((a: string) => `→ ${a}`)].join('\n') }); break;
      case 'OPTIMIZATION_COMPLETED': sys(`Construcția biletului: ${p.reason}`, p.status === 'COMPLETED' ? 'good' : 'warn'); break;
      case 'TICKET_FINALIZED': if (p.review) { sys(`🎟️ Analiza biletului tău e gata: cota ${Number(p.totalOdds).toFixed(2)} din ${p.legs} meciuri.`, 'good'); break; } sys(p.generation === 'COMPLETED' ? `🎟️ Bilet gata: cota ${Number(p.totalOdds).toFixed(2)} din ${p.legs} meciuri.` : p.generation === 'NO_BET' ? 'Rezultat: NO BET — niciun meci nu a trecut de agenți.' : `Bilet incomplet: ${p.reason ?? ''}`, p.generation === 'COMPLETED' ? 'good' : 'warn'); break;
      case 'JOB_WAITING': sys(`Așteptare ${p.retryInSeconds}s: ${p.reason}`, 'warn'); break;
      case 'JOB_PAUSED': sys(`Pauză: ${p.reason}`, 'bad'); break;
      case 'JOB_RESUMED': sys('Analiza continuă de unde a rămas.', 'warn'); break;
    }
  }
  return { messages: out, matches };
}

function typingAgents(events: NexusEvent[]) {
  const on = new Set<string>();
  for (const e of events) {
    if (!e.agentId) continue;
    if (e.type === 'AGENT_STARTED') on.add(e.agentId);
    else if (e.type === 'AGENT_COMPLETED' || e.type === 'AGENT_FAILED') on.delete(e.agentId);
    else if (e.type === 'TICKET_FINALIZED' || e.type === 'JOB_PAUSED') on.clear();
  }
  return [...on];
}

export function DebateChat({ events, upTo, live }: { events: NexusEvent[]; upTo: number; live: boolean }) {
  const visible = useMemo(() => events.filter((e) => e.seq <= upTo), [events, upTo]);
  const { messages, matches } = useMemo(() => eventsToMessages(visible), [visible]);
  const typing = useMemo(() => (live ? typingAgents(visible) : []), [visible, live]);
  const [filter, setFilter] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const shown = filter ? messages.filter((m) => m.fixture === filter) : messages;
  const fixtures = useMemo(() => [...new Set(messages.map((m) => m.fixture).filter((f): f is string => !!f))], [messages]);

  useLayoutEffect(() => { const el = box.current; if (el && stick.current) el.scrollTop = 0; }, [shown.length, typing.length]);
  useEffect(() => { const el = box.current; if (!el) return; const on = () => { stick.current = el.scrollTop < 80; }; el.addEventListener('scroll', on, { passive: true }); return () => el.removeEventListener('scroll', on); }, []);

  return (
    <section className="card overflow-hidden" aria-label="Jurnalul analizei">
      <header className="flex flex-wrap items-center gap-2 border-b border-line/70 px-4 py-3">
        <h3 className="font-display text-base font-bold">Jurnalul analizei</h3>
        <span className="text-xs text-muted">{messages.length} mesaje · cele noi sus</span>
        <div className="ml-auto flex max-w-full gap-1.5 overflow-x-auto pb-0.5">
          <button onClick={() => setFilter(null)} className={`chip shrink-0 ${!filter ? 'text-cyan' : 'text-muted'}`}>Toate</button>
          {fixtures.map((f) => <button key={f} onClick={() => setFilter(filter === f ? null : f)} className={`chip shrink-0 ${filter === f ? 'text-cyan' : 'text-muted'}`}>{matches[f] ?? f}</button>)}
        </div>
      </header>
      <div ref={box} className="max-h-[560px] min-h-[220px] space-y-3 overflow-y-auto px-3 py-4 md:px-5" role="log" aria-live="polite">
        {!shown.length && <p className="py-10 text-center text-sm text-muted">Discuția începe când agenții primesc primele meciuri.</p>}
        {typing.length > 0 && (
          <div className="flex items-center gap-2 pl-1 text-xs text-muted">
            <div className="flex -space-x-2">{typing.slice(0, 5).map((a) => <img key={a} src={AGENT_META[a]?.img} alt="" className="h-6 w-6 rounded-full border-2 border-ink object-cover" />)}</div>
            <span>{typing.map((a) => AGENT_META[a]?.short ?? a).slice(0, 4).join(', ')}{typing.length > 4 ? ` +${typing.length - 4}` : ''} {typing.length === 1 ? 'scrie' : 'scriu'}</span>
            <span className="flex gap-0.5" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>
          </div>
        )}
        {[...shown].reverse().map((m, i) => <div key={m.seq} className={i === 0 ? 'animate-[fadein_.4s_ease-out]' : undefined}>{m.kind === 'system' ? <SystemLine m={m} /> : <AgentBubble m={m} match={m.fixture ? matches[m.fixture] : undefined} />}</div>)}
      </div>
    </section>
  );
}

function SystemLine({ m }: { m: Extract<Msg, { kind: 'system' }> }) {
  const tone = m.tone === 'good' ? 'border-emerald/40 text-emerald' : m.tone === 'bad' ? 'border-rose/40 text-rose' : m.tone === 'warn' ? 'border-gold/40 text-gold' : 'border-line text-muted';
  return <div className="flex justify-center"><p className={`max-w-[92%] rounded-full border bg-ink/60 px-3 py-1 text-center text-xs ${tone}`}>{m.text} <span className="ml-1 opacity-60 tabular">{time(m.at)}</span></p></div>;
}

function AgentBubble({ m, match }: { m: Extract<Msg, { kind: 'agent' }>; match?: string }) {
  const meta = AGENT_META[m.agent];
  const accent = meta?.accent ?? '#5ee7f7';
  const border = m.tone === 'objection' ? '#e8c26a' : m.tone === 'brain' ? '#e8c26a' : m.tone === 'failed' ? '#fb7185' : m.tone === 'nobet' ? '#22325a' : accent;
  return (
    <article className="flex gap-2.5">
      {meta?.img ? <img src={meta.img} alt="" className="mt-0.5 h-9 w-9 shrink-0 rounded-full border-2 object-cover" style={{ borderColor: accent }} /> : <div className="h-9 w-9 shrink-0 rounded-full bg-panel-2" />}
      <div className="min-w-0 max-w-[88%] rounded-2xl rounded-tl-sm border bg-panel/80 px-3 py-2" style={{ borderColor: `${border}66` }}>
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-bold" style={{ color: accent }}>{meta?.name ?? m.agent}</span>
          <span className={m.tone === 'objection' || m.tone === 'brain' ? 'text-gold' : m.tone === 'failed' ? 'text-rose' : 'text-muted'}>{m.head}</span>
          {match && <span className="text-muted">· {match}</span>}
          <span className="ml-auto tabular text-[10px] text-muted/70">{time(m.at)}</span>
        </p>
        {m.chips && m.chips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {m.chips.map((c, i) => <span key={i} className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${c.tone === 'main' ? 'border-cyan/50 bg-cyan/10 text-cyan' : c.tone === 'good' ? 'border-emerald/50 bg-emerald/10 text-emerald' : 'border-line text-muted'}`}>{c.text}</span>)}
          </div>
        )}
        {m.body && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-text/90">{m.body}</p>}
        {m.links && m.links.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {m.links.map((l, i) => <li key={i} className="text-xs text-muted">📰 {l.href ? <a href={l.href} target="_blank" rel="noopener noreferrer" className="hover:text-text">{l.title}</a> : l.title}{l.source ? <span className="opacity-70"> · {l.source}</span> : null}</li>)}
          </ul>
        )}
      </div>
    </article>
  );
}
