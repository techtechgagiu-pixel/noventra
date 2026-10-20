// Client-safe reducer: turns persisted backend events into the NEXUS view state.
// The SAME reducer drives LIVE execution and HISTORICAL REPLAY, so the replay shows exactly what was recorded.

export type NexusEvent = { seq: number; type: string; stage: string; fixtureId: string | null; agentId: string | null; payload: Record<string, any>; createdAt: string };

export type AgentStatus = 'IDLE' | 'ANALYZING' | 'DEBATING' | 'DONE' | 'FAILED' | 'WAITING';
export type AgentView = { id: string; status: AgentStatus; model: string | null; activeFixtures: string[]; lastConclusion: string | null; round: number; usedFallback: boolean };
export type FixtureView = { id: string; match: string; league?: string; kickoff?: string; state: 'QUEUED' | 'RESEARCH' | 'ANALYSIS' | 'DEBATE' | 'VOTING' | 'ACCEPTED' | 'REJECTED'; marketLabel?: string | null; odds?: number | null; votesFor?: number; total?: number; reason?: string };

export type NexusState = {
  total: number;
  participants: string[];
  stage: string;
  status: 'IDLE' | 'QUEUED' | 'FETCHING' | 'ANALYZING' | 'DEBATING' | 'VOTING' | 'VALIDATING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
  agents: Record<string, AgentView>;
  scout: { status: 'IDLE' | 'RESEARCHING' | 'DONE'; message: string | null; model: string | null; dossiers: number };
  fixtures: Record<string, FixtureView>;
  order: string[];
  pool: { total: number; eligible: number } | null;
  rejectedAtDiscovery: Array<{ match: string; reason: string }>;
  batches: number;
  batchIndex: number;
  batchFraction: number;
  accepted: string[];
  rejected: string[];
  assembly: Array<{ fixtureId: string; odds: number; running: number }>;
  final: { generation: string; totalOdds: number | null; legs: number; reason: string; target: number } | null;
  log: Array<{ seq: number; text: string; tone: 'info' | 'good' | 'bad' | 'warn'; at: string }>;
  waiting: string | null;
  seed: string | null;
};

const VOTERS = ['victor', 'andrei', 'mihai', 'alex', 'diana', 'robert', 'ioana', 'radu', 'elena', 'cosmin'];
const NAMES: Record<string, string> = { victor: 'Victor', andrei: 'Andrei', mihai: 'Mihai', alex: 'Alex', diana: 'Diana', robert: 'Robert', ioana: 'Ioana', radu: 'Radu', elena: 'Elena', cosmin: 'Cosmin', scout: 'SCOUT' };

export function initialState(): NexusState {
  return {
    total: 10, participants: [],
    stage: 'QUEUED', status: 'QUEUED',
    agents: Object.fromEntries(VOTERS.map((id) => [id, { id, status: 'IDLE', model: null, activeFixtures: [], lastConclusion: null, round: 0, usedFallback: false }])),
    scout: { status: 'IDLE', message: null, model: null, dossiers: 0 },
    fixtures: {}, order: [], pool: null, rejectedAtDiscovery: [], batches: 0, batchIndex: 0, batchFraction: 0, accepted: [], rejected: [], assembly: [], final: null, log: [], waiting: null, seed: null,
  };
}

const short = (s: string | null | undefined, n = 140) => (s ? (s.length > n ? s.slice(0, n - 1) + '…' : s) : '');

export function applyEvent(prev: NexusState, e: NexusEvent): NexusState {
  const s: NexusState = { ...prev, agents: { ...prev.agents }, fixtures: { ...prev.fixtures }, log: prev.log };
  const p = e.payload ?? {};
  const log = (text: string, tone: 'info' | 'good' | 'bad' | 'warn' = 'info') => { s.log = [...s.log.slice(-199), { seq: e.seq, text, tone, at: e.createdAt }]; };
  const setFx = (id: string, patch: Partial<FixtureView>) => { s.fixtures[id] = { ...(s.fixtures[id] ?? { id, match: id, state: 'QUEUED' }), ...patch }; };
  const setAgent = (id: string, patch: Partial<AgentView>) => { if (s.agents[id]) s.agents[id] = { ...s.agents[id], ...patch }; };
  if (s.waiting && e.type !== 'JOB_WAITING') s.waiting = null;
  switch (e.type) {
    case 'JOB_CREATED': log(`Analiză autorizată: ${p.title}.`); break;
    case 'TARGET_SELECTED': log(`Țintă: cota ${p.target}${p.requiredLegs ? `, exact ${p.requiredLegs} meciuri` : ', număr automat de meciuri'}.`); break;
    case 'SEED_GENERATED': s.seed = p.seedPrefix ?? null; log(`Seed aleator generat pe server (${p.seedPrefix}…).`); break;
    case 'STAGE_CHANGED':
      s.stage = p.to;
      s.status = p.to === 'SELECTING' || p.to === 'SCOUT' ? 'FETCHING' : p.to === 'ANALYSIS' || p.to === 'STATS' ? 'ANALYZING' : p.to === 'DEBATE' ? 'DEBATING' : p.to === 'VOTING' ? 'VOTING' : p.to === 'BUILDING' ? 'VALIDATING' : s.status;
      break;
    case 'POOL_BUILT': s.pool = { total: p.totalFixtures, eligible: p.eligible }; log(`${p.totalFixtures} meciuri găsite (${p.leagues ?? "TOP 10"}), ${p.eligible} eligibile.`); break;
    case 'CANDIDATE_REJECTED':
      if (Array.isArray(p.items)) { s.rejectedAtDiscovery = p.items.map((i: any) => ({ match: i.match, reason: i.reason })); log(`${p.count} meciuri excluse (fără cote, începute etc.).`, 'warn'); }
      else if (e.fixtureId) { setFx(e.fixtureId, { state: 'REJECTED', reason: p.reason }); s.rejected = [...new Set([...s.rejected, e.fixtureId])]; }
      break;
    case 'CANDIDATE_SELECTED':
      s.order = (p.order ?? []).map((o: any) => o.fixtureId);
      for (const o of p.order ?? []) setFx(o.fixtureId, { match: o.match, league: o.league, kickoff: o.kickoff, state: 'QUEUED' });
      s.batches = p.batches ?? 0;
      log(`Ordine aleatoare de explorare salvată: ${s.order.length} meciuri în ${s.batches} loturi.`);
      break;
    case 'BATCH_STARTED': s.batchIndex = (p.batch ?? 1) - 1; s.batchFraction = 0; for (const id of p.fixtures ?? []) setFx(id, { state: 'RESEARCH' }); log(`Lotul ${p.batch}/${p.of} intră în analiză.`); break;
    case 'SCOUT_STARTED': s.scout = { ...s.scout, status: 'RESEARCHING', message: p.message }; log(p.message); break;
    case 'SCOUT_COMPLETED': s.scout = { ...s.scout, status: 'DONE', message: p.message, model: p.model ?? s.scout.model, dossiers: s.scout.dossiers + 1 }; s.batchFraction = Math.max(s.batchFraction, 0.15); log(`SCOUT: dosar istoric pentru ${p.match} (${p.homeSample}+${p.awaySample} meciuri).`); break;
    case 'STATS_COMPLETED': s.batchFraction = Math.max(s.batchFraction, 0.25); log(`Model statistic: ${p.match} — λ ${p.lambdaHome}–${p.lambdaAway}, incertitudine ${p.uncertainty}.`); break;
    case 'AGENT_STARTED': {
      const id = e.agentId!;
      if (VOTERS.includes(id) && !s.participants.includes(id)) s.participants = [...s.participants, id]; const debating = (p.round ?? 0) > 0;
      setAgent(id, { status: debating ? 'DEBATING' : 'ANALYZING', model: `${p.provider}/${p.model}`, activeFixtures: p.fixtures ?? [], round: p.round ?? 0 });
      for (const f of p.fixtures ?? []) setFx(f, { state: debating ? 'DEBATE' : 'ANALYSIS' });
      log(`${NAMES[id]} ${debating ? `intră în dezbatere (runda ${p.round})` : 'analizează'} — ${p.model}.`);
      break;
    }
    case 'PREDICTION_SAVED': setAgent(e.agentId!, { lastConclusion: p.decision === 'BET_CANDIDATE' ? `${p.marketLabel ?? p.marketKey} @ ${p.odds}` : 'NO BET' }); break;
    case 'OBJECTION_RECORDED': log(`${NAMES[e.agentId!]}: „${short(p.objection, 120)}”`, 'warn'); break;
    case 'POSITION_REVISED': setAgent(e.agentId!, { lastConclusion: p.decision === 'BET_CANDIDATE' ? `${p.marketLabel ?? p.marketKey}${p.changed ? ' (revizuit)' : ''}` : `NO BET${p.changed ? ' (revizuit)' : ''}` }); if (p.changed) log(`${NAMES[e.agentId!]} își schimbă poziția.`, 'warn'); break;
    case 'AGENT_COMPLETED': {
      const id = e.agentId!;
      setAgent(id, { status: 'DONE', activeFixtures: [], model: `${p.provider}/${p.model}`, usedFallback: !!p.usedFallback });
      const done = Object.values(s.agents).filter((a) => a.status === 'DONE' || a.status === 'FAILED').length;
      s.batchFraction = Math.max(s.batchFraction, (p.round ?? 0) === 0 ? 0.25 + 0.5 * (done / Object.keys(s.agents).length) : 0.8);
      if (p.usedFallback) log(`${NAMES[id]}: modelul principal indisponibil, a rulat rezerva ${p.model}.`, 'warn');
      break;
    }
    case 'AGENT_FAILED': if (e.agentId && s.agents[e.agentId]) { setAgent(e.agentId, { status: 'FAILED', activeFixtures: [] }); } log(`${NAMES[e.agentId ?? ''] ?? 'Agent'}: ${short(p.error, 120)} ${p.consequence ?? ''}`, 'bad'); break;
    case 'DEBATE_STARTED': for (const a of VOTERS) setAgent(a, { status: 'IDLE' }); log(`Dezbatere runda ${p.round}: ${p.fixtures?.length ?? 0} meciuri disputate.`); break;
    case 'DEBATE_SKIPPED': log(`Dezbaterea (runda ${p.round}) nu a fost necesară: ${p.reason}`); break;
    case 'VOTE_SUBMITTED': for (const a of VOTERS) if (s.agents[a].status !== 'FAILED') setAgent(a, { status: 'DONE' }); if (e.fixtureId) setFx(e.fixtureId, { state: 'VOTING' }); break;
    case 'CONSENSUS_CALCULATED': s.total = p.total ?? 6; s.batchFraction = Math.max(s.batchFraction, 0.9); log(`${p.match}: ${p.outcome === 'QUALIFIED' ? `consens ${p.votesFor}/${p.total ?? 6}` : p.outcome === 'NO_BET' ? `NO BET (${p.noBetVotes}/${p.total ?? 6})` : `fără consens (max ${p.votesFor}/${p.total ?? 6})`}.`, p.outcome === 'QUALIFIED' ? 'good' : 'info'); break;
    case 'SELECTION_ACCEPTED': setFx(e.fixtureId!, { state: 'ACCEPTED', marketLabel: p.marketLabel, odds: p.odds, votesFor: p.votesFor, reason: p.reason, total: s.total }); s.accepted = [...new Set([...s.accepted, e.fixtureId!])]; log(`✓ ${p.match}: ${p.marketLabel} @ ${p.odds}`, 'good'); break;
    case 'SELECTION_REJECTED': setFx(e.fixtureId!, { state: 'REJECTED', marketLabel: p.marketLabel, reason: p.reason, votesFor: p.votesFor }); s.rejected = [...new Set([...s.rejected, e.fixtureId!])]; break;
    case 'OPTIMIZATION_COMPLETED': s.assembly = p.steps ?? []; log(`Optimizare: ${p.reason}`, p.status === 'COMPLETED' ? 'good' : 'warn'); break;
    case 'TICKET_FINALIZED': s.final = { generation: p.generation, totalOdds: p.totalOdds, legs: p.legs, reason: p.reason, target: p.target }; s.status = 'COMPLETED'; s.stage = 'DONE'; for (const a of VOTERS) if (s.agents[a].status !== 'FAILED') setAgent(a, { status: 'DONE', activeFixtures: [] }); log(p.generation === 'COMPLETED' ? `Bilet finalizat: cota ${p.totalOdds} din ${p.legs} meciuri.` : p.generation === 'NO_BET' ? 'Rezultat: NO BET.' : 'Bilet incomplet.', p.generation === 'COMPLETED' ? 'good' : 'warn'); break;
    case 'JOB_WAITING': s.waiting = `Așteptare ${p.retryInSeconds}s: ${short(p.reason, 100)}`; for (const a of VOTERS) if (['ANALYZING', 'DEBATING'].includes(s.agents[a].status)) setAgent(a, { status: 'WAITING' }); log(s.waiting, 'warn'); break;
    case 'JOB_PAUSED': s.status = 'PAUSED'; for (const a of VOTERS) if (['ANALYZING', 'DEBATING'].includes(s.agents[a].status)) setAgent(a, { status: 'WAITING' }); log(`Analiză pusă în pauză: ${short(p.reason, 160)}`, 'bad'); break;
    case 'JOB_RESUMED': log(p.note, 'warn'); break;
    case 'VOTE_SET_ASIDE': log(`${NAMES[e.agentId ?? ''] ?? 'Agent'}: vot nenumărat (${p.marketLabel ?? p.marketKey}) — ${short(p.reason, 140)}.`, 'warn'); break;
    case 'ODDS_VALIDATED': break;
  }
  return s;
}

export const reduceEvents = (events: NexusEvent[]) => events.reduce(applyEvent, initialState());

/** Overall progress from real recorded work only (never from timers). */
export function progress(s: NexusState) {
  if (s.final) return 1;
  if (!s.batches) return s.pool ? 0.04 : 0;
  return Math.min(0.97, 0.05 + 0.85 * ((s.batchIndex + s.batchFraction) / s.batches) + (s.stage === 'BUILDING' ? 0.05 : 0));
}

export const STAGE_ORDER = ['SELECTING', 'SCOUT', 'STATS', 'ANALYSIS', 'DEBATE', 'VOTING', 'BUILDING'];

/** Per-agent recorded positions, derived only from saved events (used in live and replay). */
export function agentDetailsFromEvents(events: NexusEvent[], fixtureNames: Record<string, FixtureView>) {
  const out: Record<string, { agentId: string; items: any[] }> = {};
  const objections: Record<string, string> = {};
  for (const e of events) {
    if (!e.agentId) continue;
    const p = e.payload ?? {};
    const name = (e.fixtureId && fixtureNames[e.fixtureId]?.match) || p.match || e.fixtureId || '';
    if (e.type === 'OBJECTION_RECORDED') objections[`${e.agentId}|${e.fixtureId}|${p.round}`] = p.objection;
    if (e.type === 'PREDICTION_SAVED' || e.type === 'POSITION_REVISED') {
      (out[e.agentId] ??= { agentId: e.agentId, items: [] }).items.push({
        fixture: name, round: e.type === 'PREDICTION_SAVED' ? 0 : p.round, provider: p.provider, model: p.model, decision: p.decision, market: p.marketLabel ?? p.marketKey,
        probability: p.estimatedProbability ?? null, confidence: p.confidence ?? 0, rationale: p.rationale ?? '', evidence: p.evidence ?? [], failureReasons: p.failureReasons ?? [],
        objection: objections[`${e.agentId}|${e.fixtureId}|${p.round}`], response: p.response,
      });
    }
  }
  return out;
}
