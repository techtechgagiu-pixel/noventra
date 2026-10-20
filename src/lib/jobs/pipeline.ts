import { createHash } from 'node:crypto';
import { config } from '../config';
import { many, one, query, tx } from '../db';
import { type Prediction, type Revision, AGENTS, DEBATE_SCHEMA_TEXT, DebateOutputSchema, INITIAL_SCHEMA_TEXT, InitialOutputSchema, SCOUT_SCHEMA_TEXT, ScoutOutputSchema, VOTING_AGENTS, agentById, systemPrompt, type AgentDefinition } from '../ai/agents';
import { activeAssignments } from '../ai/assignments';
import { BudgetExceededError, RateLimitError, structuredCall } from '../ai/router';
import { optimizeTicket, type Candidate } from '../optimizer';
import { buildDossier } from '../scout/dossier';
import { teamHistory } from '../scout/history';
import { policyFor, slotById, type LegPolicy } from '../slots';
import { espnExtraMarkets, espnLeagueDay, espnSummary, mergeMarkets, standingFor } from '../sports/espn';
import { activeProvider, getLeagues, loadFixtures, persistFixtures } from '../sports/fixtures';
import type { Fixture } from '../sports/types';
import { modelFixture } from '../stats/engine';
import { localDate, yyyymmdd } from '../time';
import { agentFacts, characterViolation, newsFacts, consensus, contested, riskClass, toPosition, type FinalPosition } from './analysis';
import { agentTrackRecord, trackRecordText } from '../track-record';
import { teamNews } from '../news/google-news';
import { buildDigest } from '../digest';
import { recordEvent } from './events';
import type { CandidateEntry, Checkpoint, FixtureSnapshot, Stage } from './types';

export type JobRow = {
  id: string; user_id: string; slot: string; period_key: string; target_odds: string; required_legs: number | null; seed: string;
  config: { windowStart: string; windowDays: number; top10Only: boolean; maxFixtures: number; batchSize: number; avoidFixtures?: string[] };
  status: string; stage: Stage; checkpoint: Checkpoint; candidate_order: CandidateEntry[] | null; eligible_count: number | null; attempt_count: number;
};

/** Deterministic seeded PRNG (mulberry32 over a SHA-256 of the seed). Same seed → same ordering. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let s = createHash('sha256').update(seed).digest().readUInt32LE(0);
  const rand = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

const MIN_LEAD_MS = 20 * 60_000; // never analyse/offer a fixture starting within 20 minutes

async function setStage(job: JobRow, stage: Stage, checkpoint: Checkpoint) {
  if (job.stage !== stage) await recordEvent(job.id, { type: 'STAGE_CHANGED', stage, payload: { from: job.stage, to: stage } });
  job.stage = stage;
  job.checkpoint = checkpoint;
  await query('UPDATE ticket_generation_jobs SET stage=$2, checkpoint=$3, status=\'RUNNING\', updated_at=now() WHERE id=$1', [job.id, stage, JSON.stringify(checkpoint)]);
}
async function save(job: JobRow) {
  await query('UPDATE ticket_generation_jobs SET checkpoint=$2, updated_at=now() WHERE id=$1', [job.id, JSON.stringify(job.checkpoint)]);
}

// ── Stage 0: discovery ─────────────────────────────────────────
async function discover(job: JobRow) {
  const cp = job.checkpoint;
  await setStage(job, 'SELECTING', cp);
  const { fixtures, errors } = await loadFixtures(job.config.windowStart, job.config.windowDays, { top10Only: job.config.top10Only });
  const now = Date.now();
  const entries: CandidateEntry[] = fixtures.map((f) => {
    let reason: string | undefined;
    if (f.status !== 'pre') reason = 'Meciul a început sau s-a încheiat';
    else if (Date.parse(f.kickoff) < now + MIN_LEAD_MS) reason = 'Începe în mai puțin de 20 de minute';
    else if (!f.odds) reason = f.provider === 'lpf' ? 'Sursa oficială LPF nu publică cote verificabile' : 'Fără cote verificabile la sursă';
    else if (!f.odds.markets.some((m) => m.marketType === '1X2')) reason = 'Piața 1X2 lipsește';
    return { fixtureId: f.id, home: f.home, away: f.away, league: f.leagueName, kickoff: f.kickoff, eligible: !reason, reason };
  });
  const eligible = entries.filter((e) => e.eligible);
  const ordered = seededShuffle(eligible, job.seed);
  // Ticket B prefers fixtures not used by ticket A (moved to the end, not excluded).
  const avoid = new Set(job.config.avoidFixtures ?? []);
  const prioritized = [...ordered.filter((e) => !avoid.has(e.fixtureId)), ...ordered.filter((e) => avoid.has(e.fixtureId))].slice(0, job.config.maxFixtures);
  const batches: string[][] = [];
  for (let i = 0; i < prioritized.length; i += job.config.batchSize) batches.push(prioritized.slice(i, i + job.config.batchSize).map((e) => e.fixtureId));
  const order = [...prioritized, ...entries.filter((e) => !e.eligible)];
  await query('UPDATE ticket_generation_jobs SET candidate_order=$2, eligible_count=$3 WHERE id=$1', [job.id, JSON.stringify(order), eligible.length]);
  job.candidate_order = order;
  await recordEvent(job.id, { type: 'POOL_BUILT', stage: 'SELECTING', payload: { totalFixtures: fixtures.length, eligible: eligible.length, sourceErrors: errors.slice(0, 10), window: { start: job.config.windowStart, days: job.config.windowDays }, leagues: job.config.top10Only ? 'TOP 10' : 'TOP 10 + cupe europene + ligi extinse' } });
  const rejected = entries.filter((e) => !e.eligible);
  if (rejected.length) await recordEvent(job.id, { type: 'CANDIDATE_REJECTED', stage: 'SELECTING', payload: { count: rejected.length, items: rejected.slice(0, 60).map((r) => ({ fixtureId: r.fixtureId, match: `${r.home} – ${r.away}`, league: r.league, reason: r.reason })) } });
  await recordEvent(job.id, { type: 'CANDIDATE_SELECTED', stage: 'SELECTING', payload: { seed: job.seed.slice(0, 12), order: prioritized.map((e, i) => ({ rank: i + 1, fixtureId: e.fixtureId, match: `${e.home} – ${e.away}`, league: e.league, kickoff: e.kickoff })), batches: batches.length, batchSize: job.config.batchSize } });
  cp.batches = batches;
  cp.phase = batches.length ? 'BATCH' : 'BUILD';
  cp.batchIndex = 0;
  cp.batchStep = 'FETCH';
  await save(job);
}

// ── Helpers ────────────────────────────────────────────────────
async function batchSnapshots(job: JobRow, ids: string[]): Promise<FixtureSnapshot[]> {
  const rows = await many<{ fixture_id: string; payload: FixtureSnapshot }>('SELECT DISTINCT ON (fixture_id) fixture_id, payload FROM fixture_snapshots WHERE job_id=$1 AND fixture_id = ANY($2) ORDER BY fixture_id, id DESC', [job.id, ids]);
  const map = new Map(rows.map((r) => [r.fixture_id, r.payload]));
  return ids.flatMap((id) => (map.has(id) ? [map.get(id)!] : []));
}

async function fixtureFromDb(id: string): Promise<Fixture | null> {
  const r = await one<Record<string, unknown>>(`SELECT f.*, l.name AS league_name, l.country, l.provider_key FROM fixtures f JOIN leagues l ON l.id=f.league_id WHERE f.id=$1`, [id]);
  if (!r) return null;
  const odds = await one<{ bookmaker: string; source: string; markets: unknown; observed_at: Date; provider_updated_at: Date | null }>('SELECT bookmaker, source, markets, observed_at, provider_updated_at FROM odds_snapshots WHERE fixture_id=$1 ORDER BY observed_at DESC LIMIT 1', [id]);
  return {
    id: r.id as string, provider: r.provider as Fixture['provider'], providerId: r.provider_id as string, leagueId: r.league_id as string, leagueKey: r.provider_key as string, leagueName: r.league_name as string, country: r.country as string,
    home: r.home_team as string, away: r.away_team as string, homeTeamId: (r.home_team_id as string) ?? undefined, awayTeamId: (r.away_team_id as string) ?? undefined,
    homeLogo: (r.home_logo as string) ?? undefined, awayLogo: (r.away_logo as string) ?? undefined, kickoff: new Date(r.kickoff_utc as string).toISOString(), status: r.status as Fixture['status'],
    odds: odds ? { bookmaker: odds.bookmaker, source: odds.source, markets: odds.markets as never, observedAt: new Date(odds.observed_at).toISOString(), providerUpdatedAt: odds.provider_updated_at ? new Date(odds.provider_updated_at).toISOString() : null } : null,
    fetchedAt: new Date().toISOString(),
  };
}

/** Re-reads the fixture's day from the source (cached ≤10 min) to get the current status and price. */
async function freshFixture(f: Fixture): Promise<Fixture | null> {
  if (f.provider !== 'espn') return f;
  const leagues = await getLeagues({ top10Only: false });
  const league = leagues.find((l) => l.id === f.leagueId);
  if (!league) return null;
  if (activeProvider() !== (await import('../sports/fixtures')).liveProvider) {
    const { fixtures } = await activeProvider()([league], [localDate(new Date(f.kickoff))]);
    return fixtures.find((x) => x.id === f.id) ?? null;
  }
  const day = await espnLeagueDay(league, yyyymmdd(localDate(new Date(f.kickoff))));
  const found = day.find((x) => x.id === f.id) ?? null;
  if (found) await persistFixtures([found]);
  return found ? withExtraMarkets(found) : null;
}

/** Adds Bet365 / DraftKings-prop selections (each tagged with its bookmaker) to an ESPN fixture. */
async function withExtraMarkets(f: Fixture): Promise<Fixture> {
  if (f.provider !== 'espn' || !f.odds) return f;
  const extra = await espnExtraMarkets(f).catch(() => []);
  return { ...f, odds: { ...f.odds, markets: mergeMarkets(f.odds.markets, extra, f.odds.bookmaker) } };
}

// ── Batch steps ────────────────────────────────────────────────
async function stepFetchScoutStats(job: JobRow, ids: string[]) {
  const cp = job.checkpoint;
  if (cp.batchStep === 'FETCH') {
    await setStage(job, 'SCOUT', cp);
    await recordEvent(job.id, { type: 'BATCH_STARTED', stage: 'SCOUT', payload: { batch: cp.batchIndex + 1, of: cp.batches.length, fixtures: ids } });
    await recordEvent(job.id, { type: 'SCOUT_STARTED', stage: 'SCOUT', payload: { message: 'SCOUT analizează statisticile meciurilor anterioare.', mode: 'statistics', fixtures: ids.length } });
    const existing = new Set((await batchSnapshots(job, ids)).map((s) => s.fixture.id));
    // Fixtures of a batch are prepared in parallel (history, standings, news are independent).
    await Promise.all(ids.filter((id) => !existing.has(id)).map(async (id) => {
      const stored = await fixtureFromDb(id);
      const f = stored ? await withExtraMarkets(stored) : null;
      if (!f || !f.odds) { await recordEvent(job.id, { type: 'CANDIDATE_REJECTED', stage: 'SCOUT', fixtureId: id, payload: { reason: 'Datele meciului nu mai sunt disponibile' } }); return; }
      const [home, away] = await Promise.all([teamHistory(f, 'home'), teamHistory(f, 'away')]);
      let standings: FixtureSnapshot['standings'] = { home: null, away: null };
      if (f.provider === 'espn') {
        try {
          const summary = await espnSummary(f.leagueKey, f.providerId);
          const sh = standingFor(summary, f.homeTeamId), sa = standingFor(summary, f.awayTeamId);
          standings = { home: sh ? { rank: sh.rank, points: sh.points, played: sh.played } : null, away: sa ? { rank: sa.rank, points: sa.points, played: sa.played } : null };
        } catch { /* standings stay explicitly missing */ }
      }
      const dossier = buildDossier({ home: f.home, away: f.away, kickoff: f.kickoff, league: f.leagueName, homeMatches: home.matches, awayMatches: away.matches, missing: [...home.missing, ...away.missing] });
      const ppg = (s: { points: number | null; played: number | null } | null) => (s && s.points !== null && s.played ? Math.round((s.points / s.played) * 100) / 100 : null);
      const model = modelFixture({ homeHistory: home.matches, awayHistory: away.matches, markets: f.odds.markets, homePpg: ppg(standings.home), awayPpg: ppg(standings.away) });
      let news: FixtureSnapshot['news'];
      if (f.provider !== 'demo') {
        const [nh, na] = await Promise.all([teamNews(f.home, f.kickoff), teamNews(f.away, f.kickoff)]);
        news = { home: nh.items, away: na.items, errors: [...nh.errors, ...na.errors] };
        await recordEvent(job.id, { type: 'NEWS_COLLECTED', stage: 'SCOUT', fixtureId: f.id, agentId: 'hantu', payload: { match: `${f.home} – ${f.away}`, home: nh.items.length, away: na.items.length, headlines: [...nh.items, ...na.items].slice(0, 6).map((x) => ({ title: x.title, source: x.source, publishedAt: x.publishedAt, link: x.link })), errors: news.errors.slice(0, 2) } });
      }
      const snapshot: FixtureSnapshot = {
        fixture: { id: f.id, home: f.home, away: f.away, league: `${f.country} · ${f.leagueName}`, leagueKey: f.leagueKey, kickoff: f.kickoff, provider: f.provider, providerId: f.providerId },
        odds: f.odds, standings, model, dossier, news,
        dataQuality: { historyHome: home.matches.length, historyAway: away.matches.length, shotsAvailable: model.usedShotsOnTarget, standings: !!(standings.home && standings.away), oddsObservedAt: f.odds.observedAt },
      };
      await query('INSERT INTO fixture_snapshots(fixture_id, job_id, payload, data_quality) VALUES ($1,$2,$3,$4)', [f.id, job.id, JSON.stringify(snapshot), JSON.stringify(snapshot.dataQuality)]);
      await query('INSERT INTO scout_dossiers(job_id, fixture_id, mode, dossier) VALUES ($1,$2,$3,$4) ON CONFLICT (job_id, fixture_id) DO NOTHING', [job.id, f.id, 'statistics', JSON.stringify(dossier)]);
    }));
    cp.batchStep = 'SCOUT';
    await save(job);
    return;
  }
  if (cp.batchStep === 'SCOUT') {
    const snaps = await batchSnapshots(job, ids);
    const scout = agentById('scout')!;
    const assignment = (await activeAssignments()).get('scout');
    let narrative: { model: string; provider: string; fixtures: Array<{ fixtureId: string; summary: string; keyObservations: string[] }> } | null = null;
    if (assignment && snaps.length) {
      try {
        const res = await structuredCall({
          primary: assignment.primary, fallback: assignment.fallback, schema: ScoutOutputSchema,
          input: { system: systemPrompt(scout), user: `Schema: ${SCOUT_SCHEMA_TEXT}\nDate:\n${JSON.stringify(snaps.map((s) => ({ fixtureId: s.fixture.id, ...agentFacts(s).scout, missing: s.dossier.missing.slice(0, 3) })))}`, maxOutputTokens: 1200, temperature: scout.temperature },
          log: { jobId: job.id, agentId: 'scout', stage: 'SCOUT' },
        });
        narrative = { model: res.model, provider: res.provider, fixtures: res.data.fixtures };
      } catch (error) {
        if (error instanceof RateLimitError || error instanceof BudgetExceededError) throw error;
        await recordEvent(job.id, { type: 'AGENT_FAILED', stage: 'SCOUT', agentId: 'scout', payload: { error: (error as Error).message.slice(0, 300), note: 'Dosarul statistic rămâne valid; lipsește doar rezumatul textual.' } });
      }
    }
    for (const s of snaps) {
      const n = narrative?.fixtures.find((x) => x.fixtureId === s.fixture.id) ?? null;
      if (n) await query('UPDATE scout_dossiers SET narrative=$3, model=$4 WHERE job_id=$1 AND fixture_id=$2', [job.id, s.fixture.id, JSON.stringify(n), `${narrative!.provider}/${narrative!.model}`]);
      await recordEvent(job.id, { type: 'SCOUT_COMPLETED', stage: 'SCOUT', fixtureId: s.fixture.id, agentId: 'scout', payload: {
        match: `${s.fixture.home} – ${s.fixture.away}`, mode: 'statistics', message: s.dossier.modeMessage,
        homeSample: s.dossier.home.sample, awaySample: s.dossier.away.sample,
        homeVerdict: s.dossier.home.resultsVsPerformance, awayVerdict: s.dossier.away.resultsVsPerformance,
        anomalies: [...s.dossier.home.anomalies, ...s.dossier.away.anomalies].filter((a) => a.classification !== 'INSUFFICIENT EVIDENCE').slice(0, 6),
        summary: n?.summary ?? null, observations: n?.keyObservations ?? [], model: narrative ? `${narrative.provider}/${narrative.model}` : null,
      } });
    }
    cp.batchStep = 'STATS';
    await save(job);
    return;
  }
  if (cp.batchStep === 'STATS') {
    await setStage(job, 'STATS', cp);
    for (const s of await batchSnapshots(job, ids)) {
      const best = [...s.model.markets].filter((m) => m.estimatedProbability !== null).sort((a, b) => (b.expectedValue ?? -9) - (a.expectedValue ?? -9))[0];
      await recordEvent(job.id, { type: 'STATS_COMPLETED', stage: 'STATS', fixtureId: s.fixture.id, payload: {
        match: `${s.fixture.home} – ${s.fixture.away}`, lambdaHome: s.model.lambdaHome, lambdaAway: s.model.lambdaAway, uncertainty: s.model.uncertainty, margin: s.model.bookmakerMargin1x2, method: s.model.method,
        markets: s.model.markets, bestEv: best ? { key: best.key, label: best.label, ev: best.expectedValue } : null, bookmaker: s.odds.bookmaker, observedAt: s.odds.observedAt,
      } });
    }
    cp.batchStep = 'INITIAL';
    cp.agentsDone = [];
    await save(job);
  }
}

async function runAgent(job: JobRow, agent: AgentDefinition, ids: string[], round: number) {
  const snaps = await batchSnapshots(job, ids);
  if (!snaps.length) return;
  const assignment = (await activeAssignments()).get(agent.id);
  if (!assignment) throw new Error(`Agentul ${agent.id} nu are model alocat.`);
  const stage: Stage = round === 0 ? 'ANALYSIS' : 'DEBATE';
  await recordEvent(job.id, { type: 'AGENT_STARTED', stage, agentId: agent.id, payload: { round, fixtures: snaps.map((s) => s.fixture.id), provider: assignment.primary.provider, model: assignment.primary.model, promptVersion: assignment.promptVersion } });
  const policy = jobPolicy(job);
  const band = { minOdds: policy.minOdds, maxOdds: Math.min(agent.maxOdds + (policy.agentCapBonus ?? 0), policy.maxOdds) };
  const facts: Array<{ fixtureId: string; match: string; markets: Array<{ key: string; odds: number; est?: number | null; ev?: number | null }> }> =
    agent.id === 'hantu' ? snaps.map((s) => newsFacts(s, band)) : snaps.map((s) => agentFacts(s, band));
  const record = trackRecordText(await agentTrackRecord(agent.id).catch(() => null));
  const validKeys = new Map(snaps.map((s) => [s.fixture.id, new Set(s.model.markets.map((m) => m.key))]));
  let user: string;
  if (round === 0) {
    user = `Analizează independent fiecare meci. Bilet: ${ticketBrief(job, policy)}${record ? `\n${record}` : ''}\nSchema răspunsului: ${INITIAL_SCHEMA_TEXT}\nMeciuri (${facts.length}):\n${JSON.stringify(facts)}`;
  } else {
    const prior = await many<{ fixture_id: string; agent_id: string; round: number; decision: string; market_key: string | null; estimated_probability: string | null; payload: { rationale?: string; failureReasons?: string[]; objection?: string } }>(
      `SELECT DISTINCT ON (fixture_id, agent_id) fixture_id, agent_id, round, decision, market_key, estimated_probability, payload FROM agent_predictions WHERE job_id=$1 AND fixture_id = ANY($2) AND round < $3 ORDER BY fixture_id, agent_id, round DESC`,
      [job.id, ids, round],
    );
    const debateFacts = facts.map((f) => ({
      fixtureId: f.fixtureId, match: f.match, markets: f.markets.map((m) => ({ key: m.key, odds: m.odds, estimated: m.est, ev: m.ev })),
      yourPosition: prior.find((p) => p.fixture_id === f.fixtureId && p.agent_id === agent.id) ? summarize(prior.find((p) => p.fixture_id === f.fixtureId && p.agent_id === agent.id)!) : 'fără poziție (eroare anterioară)',
      others: prior.filter((p) => p.fixture_id === f.fixtureId && p.agent_id !== agent.id).map((p) => `${agentById(p.agent_id)?.name}: ${summarize(p)}`),
      leadingCandidate: (() => { const t: Record<string, number> = {}; for (const p of prior.filter((x) => x.fixture_id === f.fixtureId && x.decision === 'BET_CANDIDATE' && x.market_key)) t[p.market_key!] = (t[p.market_key!] ?? 0) + 1; const top = Object.entries(t).sort((a, b) => b[1] - a[1])[0]; return top ? `${top[0]} (${top[1]}/${VOTING_AGENTS.length} voturi)` : 'niciunul'; })(),
    }));
    user = `Runda ${round} de dezbatere. Ai văzut pozițiile celorlalți agenți. Contestă argumentele slabe, apără-ți poziția sau schimb-o DOAR dacă un argument are suport în date. Spune explicit dacă poți susține „leadingCandidate” (selecția cu cele mai multe voturi); o selecție intră pe bilet cu minimum ${config.limits.consensusThreshold}/${VOTING_AGENTS.length} voturi (5/10 dacă Mircea Sandu și Mircea Lucescu o refuză amândoi; un vot pentru o selecție mai strictă o susține și pe cea mai largă, iar câștigă selecția susținută de cei mai mulți). Rămâi în limitele tale de cotă și probabilitate, dar nu vota împotriva propriei analize doar pentru consens. Schema răspunsului: ${DEBATE_SCHEMA_TEXT}\nMeciuri în dezbatere:\n${JSON.stringify(debateFacts)}`;
  }
  try {
    const res = round === 0
      ? await structuredCall({ primary: assignment.primary, fallback: assignment.fallback, schema: InitialOutputSchema, input: { system: systemPrompt(agent), user, temperature: agent.temperature, maxOutputTokens: Math.min(config.limits.maxOutputTokens, 380 * snaps.length + 300) }, log: { jobId: job.id, agentId: agent.id, stage: 'INITIAL' } })
      : await structuredCall({ primary: assignment.primary, fallback: assignment.fallback, schema: DebateOutputSchema, input: { system: systemPrompt(agent), user, temperature: agent.temperature, maxOutputTokens: Math.min(config.limits.maxOutputTokens, 300 * snaps.length + 300) }, log: { jobId: job.id, agentId: agent.id, stage: `DEBATE${round}` } });
    let items: Array<Prediction | Revision> = 'predictions' in res.data ? res.data.predictions : res.data.revisions;
    // One follow-up call for fixtures the model skipped, before recording an abstention.
    const missingIds = snaps.filter((s) => !items.some((p) => p.fixtureId === s.fixture.id)).map((s) => s.fixture.id);
    if (missingIds.length && missingIds.length < snaps.length) {
      try {
        const subset = facts.filter((f) => missingIds.includes(f.fixtureId));
        const retry = round === 0
          ? await structuredCall({ primary: assignment.primary, fallback: assignment.fallback, schema: InitialOutputSchema, input: { system: systemPrompt(agent), user: `Analizează independent fiecare meci. Bilet: ${ticketBrief(job, policy)}\nSchema răspunsului: ${INITIAL_SCHEMA_TEXT}\nMeciuri (${subset.length}):\n${JSON.stringify(subset)}`, temperature: agent.temperature, maxOutputTokens: 380 * subset.length + 300 }, log: { jobId: job.id, agentId: agent.id, stage: 'INITIAL_RETRY' } })
          : null;
        if (retry) items = [...items, ...retry.data.predictions];
      } catch (e) { if (e instanceof RateLimitError || e instanceof BudgetExceededError) throw e; }
    }
    for (const s of snaps) {
      const item = items.find((p) => p.fixtureId === s.fixture.id);
      if (!item) { await recordEvent(job.id, { type: 'AGENT_FAILED', stage, agentId: agent.id, fixtureId: s.fixture.id, payload: { round, error: 'Agentul nu a răspuns pentru acest meci (abținere).' } }); continue; }
      const pos = toPosition(agent.id, item, round, res.provider, res.model, validKeys.get(s.fixture.id)!);
      const market = s.model.markets.find((m) => m.key === pos.marketKey) ?? null;
      const enriched = { ...item, marketKey: pos.marketKey, decision: pos.decision, availableOdds: market?.odds ?? null, expectedValue: market && pos.estimatedProbability !== null ? Math.round((pos.estimatedProbability * market.odds - 1) * 1000) / 1000 : null, marketLabel: market?.label ?? null };
      await query(
        `INSERT INTO agent_predictions (job_id, fixture_id, agent_id, round, provider, model_id, prompt_version, decision, market_key, estimated_probability, confidence, risk, payload, odds)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (job_id, fixture_id, agent_id, round) DO NOTHING`,
        [job.id, s.fixture.id, agent.id, round, res.provider, res.model, assignment.promptVersion, pos.decision, pos.marketKey, pos.estimatedProbability, Math.round(pos.confidence), pos.risk, JSON.stringify(enriched), market?.odds ?? null],
      );
      if (round === 0) await recordEvent(job.id, { type: 'PREDICTION_SAVED', stage, agentId: agent.id, fixtureId: s.fixture.id, payload: { match: `${s.fixture.home} – ${s.fixture.away}`, decision: pos.decision, marketKey: pos.marketKey, marketLabel: market?.label ?? null, odds: market?.odds ?? null, estimatedProbability: pos.estimatedProbability, confidence: pos.confidence, risk: pos.risk, rationale: item.rationale, evidence: 'evidence' in item ? item.evidence : [], failureReasons: 'failureReasons' in item ? item.failureReasons : [], provider: res.provider, model: res.model } });
      else {
        const rev = item as { objection?: string; response?: string; changed?: boolean };
        if (rev.objection) await recordEvent(job.id, { type: 'OBJECTION_RECORDED', stage, agentId: agent.id, fixtureId: s.fixture.id, payload: { round, objection: rev.objection } });
        await recordEvent(job.id, { type: 'POSITION_REVISED', stage, agentId: agent.id, fixtureId: s.fixture.id, payload: { round, changed: !!rev.changed, decision: pos.decision, marketKey: pos.marketKey, marketLabel: market?.label ?? null, response: rev.response ?? '', rationale: item.rationale, provider: res.provider, model: res.model } });
      }
    }
    await recordEvent(job.id, { type: 'AGENT_COMPLETED', stage, agentId: agent.id, payload: { round, provider: res.provider, model: res.model, requestedModel: res.requestedModel, usedFallback: res.usedFallback, inputTokens: res.inputTokens, outputTokens: res.outputTokens, latencyMs: res.latencyMs } });
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof BudgetExceededError) throw error;
    // Recorded as an abstention: no vote is ever invented for a failed agent.
    await recordEvent(job.id, { type: 'AGENT_FAILED', stage, agentId: agent.id, payload: { round, error: (error as Error).message.slice(0, 300), consequence: 'Abținere — votul nu este inventat.' } });
  }
}

const summarize = (p: { decision: string; market_key: string | null; estimated_probability: string | null; payload: { rationale?: string; failureReasons?: string[] } }) =>
  `${p.decision === 'BET_CANDIDATE' ? `PARIU ${p.market_key} (p≈${p.estimated_probability ?? '?'})` : 'NO BET'} — ${(p.payload.rationale ?? '').slice(0, 220)}${p.payload.failureReasons?.[0] ? ` | Risc: ${p.payload.failureReasons[0].slice(0, 120)}` : ''}`;

function jobPolicy(job: JobRow): LegPolicy {
  return policyFor(job.slot, Number(job.target_odds));
}

function ticketBrief(job: JobRow, p: LegPolicy) {
  const base = `țintă cotă ${Number(job.target_odds)}, construit din minimum ${p.minLegs} selecții cu cote ${p.minOdds.toFixed(2)}–${p.maxOdds.toFixed(2)} și probabilitate ≥ ${Math.round(p.minProbability * 100)}% (după motorul statistic).`;
  if (p.pick === 'highest') {
    const avg = Math.pow(Number(job.target_odds), 1 / p.minLegs);
    return `${base} Biletul are nevoie de o cotă medie de aproximativ ${avg.toFixed(2)} pe meci, deci aici NU alegi automat varianta cea mai mică: alege selecția solidă cu cotă între ${p.minOdds.toFixed(2)} și ${p.maxOdds.toFixed(2)}. La acest bilet limita ta de cotă este mărită cu +${(p.agentCapBonus ?? 0).toFixed(2)}.`;
  }
  return `${base} Caută selecția SIGURĂ, nu cota mare.`;
}

/** Applies the character guard: out-of-character votes become NO_BET (and are reported, never silently dropped). */
function guardPositions(job: JobRow, s: FixtureSnapshot, positions: FinalPosition[]) {
  const policy = jobPolicy(job);
  const setAside: Array<{ agentId: string; marketKey: string | null; reason: string }> = [];
  const counted = positions.map((p) => {
    const agent = agentById(p.agentId);
    if (!agent) return p;
    const reason = characterViolation(p, agent, policy, s.model.markets.find((m) => m.key === p.marketKey));
    if (!reason) return p;
    setAside.push({ agentId: p.agentId, marketKey: p.marketKey, reason });
    return { ...p, decision: 'NO_BET' as const, marketKey: null };
  });
  const keys = s.model.markets
    .filter((m) => m.odds >= policy.minOdds && m.odds <= policy.maxOdds && (m.estimatedProbability ?? 0) >= policy.minProbability)
    .map((m) => ({ key: m.key, odds: m.odds }));
  return { counted, setAside, keys };
}

async function latestPositions(jobId: string, fixtureId: string): Promise<FinalPosition[]> {
  const rows = await many<{ agent_id: string; round: number; decision: 'BET_CANDIDATE' | 'NO_BET'; market_key: string | null; estimated_probability: string | null; confidence: number; risk: string; payload: { rationale?: string }; provider: string; model_id: string }>(
    'SELECT DISTINCT ON (agent_id) agent_id, round, decision, market_key, estimated_probability, confidence, risk, payload, provider, model_id FROM agent_predictions WHERE job_id=$1 AND fixture_id=$2 ORDER BY agent_id, round DESC',
    [jobId, fixtureId],
  );
  return rows.map((r) => ({ agentId: r.agent_id, decision: r.decision, marketKey: r.market_key, estimatedProbability: r.estimated_probability === null ? null : Number(r.estimated_probability), confidence: r.confidence, risk: r.risk, round: r.round, rationale: r.payload.rationale ?? '', provider: r.provider, model: r.model_id }));
}

async function stepAgents(job: JobRow, ids: string[], round: number, deadline: number) {
  const cp = job.checkpoint;
  const targetIds = round === 0 ? ids : cp.debateFixtures ?? [];
  if (round > 0 && !cp.agentsDone.length) {
    await setStage(job, 'DEBATE', cp);
    await recordEvent(job.id, { type: 'DEBATE_STARTED', stage: 'DEBATE', payload: { round, fixtures: targetIds } });
  } else if (round === 0 && !cp.agentsDone.length) await setStage(job, 'ANALYSIS', cp);
  // All pending agents work at the same time (independent analyses); each one is checkpointed as it finishes.
  if (Date.now() > deadline) return false;
  const pending = VOTING_AGENTS.filter((a) => !cp.agentsDone.includes(a.id));
  const results = await Promise.allSettled(pending.map(async (agent) => {
    await runAgent(job, agent, targetIds, round);
    cp.agentsDone.push(agent.id);
  }));
  await save(job);
  const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failure) throw failure.reason; // rate/budget limits: finished agents stay done, the rest resume later
  cp.agentsDone = [];
  return true;
}

async function chooseDebate(job: JobRow, ids: string[], round: number) {
  const out: string[] = [];
  const snaps = await batchSnapshots(job, ids);
  for (const id of ids) {
    const snap = snaps.find((s) => s.fixture.id === id);
    if (!snap) continue;
    const { counted: pos, keys } = guardPositions(job, snap, await latestPositions(job.id, id));
    if (round === 1 ? contested(pos, keys, config.limits.consensusThreshold, VOTING_AGENTS.length) : (() => { const c = consensus(pos, config.limits.consensusThreshold, VOTING_AGENTS.length, keys, jobPolicy(job).pick); return c.outcome !== 'QUALIFIED' && c.votesFor === c.requiredVotes - 1; })()) out.push(id);
  }
  return out;
}

async function stepVote(job: JobRow, ids: string[]) {
  await setStage(job, 'VOTING', job.checkpoint);
  const threshold = config.limits.consensusThreshold;
  const N = VOTING_AGENTS.length;
  for (const s of await batchSnapshots(job, ids)) {
    const exists = await one('SELECT 1 FROM final_decisions WHERE job_id=$1 AND fixture_id=$2', [job.id, s.fixture.id]);
    if (exists) continue;
    const raw = await latestPositions(job.id, s.fixture.id);
    for (const p of raw) await recordEvent(job.id, { type: 'VOTE_SUBMITTED', stage: 'VOTING', agentId: p.agentId, fixtureId: s.fixture.id, payload: { decision: p.decision, marketKey: p.marketKey, round: p.round, model: `${p.provider}/${p.model}` } });
    const { counted: positions, setAside, keys } = guardPositions(job, s, raw);
    for (const v of setAside) await recordEvent(job.id, { type: 'VOTE_SET_ASIDE', stage: 'VOTING', agentId: v.agentId, fixtureId: s.fixture.id, payload: { marketKey: v.marketKey, marketLabel: s.model.markets.find((m) => m.key === v.marketKey)?.label ?? null, reason: v.reason, note: 'Vot în afara caracterului agentului sau a regulilor de prudență — nenumărat.' } });
    const c = consensus(positions, threshold, VOTING_AGENTS.length, keys, jobPolicy(job).pick);
    await recordEvent(job.id, { type: 'CONSENSUS_CALCULATED', stage: 'VOTING', fixtureId: s.fixture.id, payload: { match: `${s.fixture.home} – ${s.fixture.away}`, ...c, threshold: c.requiredVotes, total: N, setAside: setAside.length } });
    const validation: Record<string, unknown> = {};
    let outcome: 'QUALIFIED' | 'NO_CONSENSUS' | 'NO_BET' | 'REJECTED' = c.outcome;
    let reason = c.outcome === 'QUALIFIED' ? '' : c.outcome === 'NO_BET' ? `${c.noBetVotes}/${N} agenți au recomandat NO BET.` : `Consens insuficient: maximum ${c.votesFor}/${N} voturi pentru aceeași selecție în limitele de prudență (prag ${c.requiredVotes}/${N}${c.cautiousVeto ? ', ridicat pentru că Mircea Sandu și Mircea Lucescu au refuzat' : ''}${setAside.length ? `; ${setAside.length} voturi nenumărate pentru că erau în afara caracterului` : ''}).`;
    if (c.outcome === 'QUALIFIED' && c.marketKey) {
      const est = s.model.markets.find((m) => m.key === c.marketKey)!;
      const base = await fixtureFromDb(s.fixture.id);
      const fresh = base ? await freshFixture(base).catch(() => null) : null;
      const freshQuote = fresh?.odds?.markets.find((m) => m.key === c.marketKey) ?? null;
      const observedAt = fresh?.odds?.observedAt ?? s.odds.observedAt;
      const ageMin = (Date.now() - Date.parse(observedAt)) / 60_000;
      const checks = {
        fixtureStillPreMatch: !!fresh && fresh.status === 'pre' && Date.parse(fresh.kickoff) > Date.now() + MIN_LEAD_MS,
        oddsAvailable: !!freshQuote,
        oddsFresh: ageMin <= config.limits.oddsMaxAgeMinutes,
        bookmakerIdentified: !!(freshQuote?.bookmaker ?? fresh?.odds?.bookmaker),
        selectionConsistent: s.model.markets.some((m) => m.key === c.marketKey),
        probabilityPlausible: est.estimatedProbability !== null && est.estimatedProbability >= 0.25,
        evNotStronglyNegative: est.estimatedProbability !== null && freshQuote ? est.estimatedProbability * freshQuote.odds - 1 >= -0.12 : false,
        dataSufficient: s.dataQuality.historyHome >= 3 && s.dataQuality.historyAway >= 3,
      };
      Object.assign(validation, checks, { originalOdds: est.odds, currentOdds: freshQuote?.odds ?? null, observedAt, bookmaker: freshQuote?.bookmaker ?? fresh?.odds?.bookmaker ?? s.odds.bookmaker });
      const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      await recordEvent(job.id, { type: 'ODDS_VALIDATED', stage: 'VOTING', fixtureId: s.fixture.id, payload: { checks, originalOdds: est.odds, currentOdds: freshQuote?.odds ?? null, observedAt } });
      if (failed.length) {
        outcome = 'REJECTED';
        const labels: Record<string, string> = { fixtureStillPreMatch: 'meciul nu mai este pre-meci', oddsAvailable: 'cota nu mai este disponibilă', oddsFresh: 'cota este prea veche', bookmakerIdentified: 'bookmaker neidentificat', selectionConsistent: 'selecție inconsistentă', probabilityPlausible: 'probabilitate estimată prea mică', evNotStronglyNegative: 'valoare așteptată clar negativă', dataSufficient: 'istoric insuficient' };
        reason = `Consens ${c.votesFor}/${N}, dar validarea a respins selecția: ${failed.map((f) => labels[f]).join(', ')}.`;
      } else reason = `Consens ${c.votesFor}/${N} pentru „${est.label}”${c.directVotes < c.votesFor ? ` (${c.directVotes} voturi directe + ${c.votesFor - c.directVotes} pentru o selecție mai strictă care o include)` : ''}; validare trecută.`;
    }
    await query('INSERT INTO final_decisions(job_id, fixture_id, outcome, market_key, votes_for, votes, validation, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (job_id, fixture_id) DO NOTHING',
      [job.id, s.fixture.id, outcome, c.marketKey, c.votesFor, JSON.stringify(positions), JSON.stringify(validation), reason]);
    await recordEvent(job.id, { type: outcome === 'QUALIFIED' ? 'SELECTION_ACCEPTED' : 'SELECTION_REJECTED', stage: 'VOTING', fixtureId: s.fixture.id, payload: { match: `${s.fixture.home} – ${s.fixture.away}`, outcome, marketKey: c.marketKey, marketLabel: s.model.markets.find((m) => m.key === c.marketKey)?.label ?? null, odds: (validation.currentOdds as number) ?? null, votesFor: c.votesFor, reason } });
    job.checkpoint.analyzed++;
    if (outcome === 'QUALIFIED') job.checkpoint.qualified++;
  }
  await save(job);
}

async function qualifiedCandidates(job: JobRow): Promise<Array<Candidate & { marketKey: string; label: string; observedAt: string; probability: number | null; riskLabel: string; snapshot: FixtureSnapshot }>> {
  const rows = await many<{ fixture_id: string; market_key: string; votes_for: number; validation: { currentOdds: number; observedAt: string; bookmaker: string } }>(
    "SELECT fixture_id, market_key, votes_for, validation FROM final_decisions WHERE job_id=$1 AND outcome='QUALIFIED'", [job.id]);
  const snaps = await batchSnapshots(job, rows.map((r) => r.fixture_id));
  return rows.flatMap((r) => {
    const s = snaps.find((x) => x.fixture.id === r.fixture_id);
    if (!s) return [];
    const est = s.model.markets.find((m) => m.key === r.market_key)!;
    const risk = riskClass(est.estimatedProbability, s.model.uncertainty);
    const quality = (r.votes_for / VOTING_AGENTS.length) * (s.model.uncertainty === 'scăzută' ? 1 : s.model.uncertainty === 'medie' ? 0.85 : 0.65) * (est.estimatedProbability ?? 0.3);
    return [{ fixtureId: r.fixture_id, teams: [s.fixture.home, s.fixture.away], odds: r.validation.currentOdds, bookmaker: r.validation.bookmaker, quality, risk, marketKey: r.market_key, label: est.label, observedAt: r.validation.observedAt, probability: est.estimatedProbability, riskLabel: risk, snapshot: s }];
  });
}

async function tryOptimize(job: JobRow) {
  const slot = slotById(job.slot);
  const policy = jobPolicy(job);
  const cands = await qualifiedCandidates(job);
  return { cands, result: optimizeTicket({ candidates: cands, target: Number(job.target_odds), requiredLegs: slot ? slot.requiredLegs : Number(job.target_odds) >= 50 ? 12 : null, tolerance: config.limits.targetTolerance, avoidFixtures: new Set(job.config.avoidFixtures ?? []), minLegs: policy.minLegs, maxLegs: policy.maxLegs, maxLegOdds: policy.maxOdds }) };
}

async function build(job: JobRow) {
  await setStage(job, 'BUILDING', job.checkpoint);
  const { cands, result } = await tryOptimize(job);
  const analyzed = job.checkpoint.analyzed;
  await recordEvent(job.id, { type: 'OPTIMIZATION_COMPLETED', stage: 'BUILDING', payload: {
    status: result.status, totalOdds: result.totalOdds, target: Number(job.target_odds), legs: result.legs.map((l) => l.fixtureId), qualified: cands.length, analyzed, reason: result.reason,
    closest: result.closest ? { totalOdds: result.closest.totalOdds, legs: result.closest.legs.map((l) => l.fixtureId) } : null,
    steps: (result.legs.length ? result.legs : result.closest?.legs ?? []).reduce<Array<{ fixtureId: string; odds: number; running: number }>>((acc, l) => { const prev = acc.at(-1)?.running ?? 1; acc.push({ fixtureId: l.fixtureId, odds: l.odds, running: Math.round(prev * l.odds * 1000) / 1000 }); return acc; }, []),
  } });
  const generation = result.status === 'COMPLETED' ? 'COMPLETED' : cands.length === 0 ? 'NO_BET' : 'INCOMPLETE';
  const chosen = result.status === 'COMPLETED' ? result.legs : [];
  const byId = new Map(cands.map((c) => [c.fixtureId, c]));
  const summary = {
    analyzed, qualified: cands.length, eligible: job.eligible_count, agents: VOTING_AGENTS.length, threshold: config.limits.consensusThreshold, reason: generation === 'NO_BET' ? `Niciun meci analizat nu a primit consens validat (${analyzed} meciuri analizate).` : result.reason,
    closest: result.closest ? { totalOdds: result.closest.totalOdds, legs: result.closest.legs.map((l) => ({ fixtureId: l.fixtureId, match: byId.get(l.fixtureId)?.teams.join(' – '), label: byId.get(l.fixtureId)?.label, odds: l.odds })) } : null,
    mixedBookmakers: result.mixedBookmakers,
  };
  await tx(async (c) => {
    const t = await c.query(
      `INSERT INTO tickets (job_id, user_id, slot, period_key, target_odds, actual_odds, leg_count, generation_status, outcome_status, mixed_bookmakers, summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (job_id) DO UPDATE SET job_id=EXCLUDED.job_id RETURNING id`,
      [job.id, job.user_id, job.slot, job.period_key, job.target_odds, chosen.length ? result.totalOdds : null, chosen.length, generation, generation === 'COMPLETED' ? 'PENDING' : 'NOT_APPLICABLE', result.mixedBookmakers, JSON.stringify(summary)],
    );
    const ticketId = t.rows[0].id as string;
    let pos = 1;
    for (const leg of chosen) {
      const cd = byId.get(leg.fixtureId)!;
      await c.query(
        `INSERT INTO ticket_selections (ticket_id, fixture_id, position, market_key, market_label, odds, bookmaker, quote_observed_at, votes_for, model_probability, risk, snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (ticket_id, fixture_id) DO NOTHING`,
        [ticketId, leg.fixtureId, pos++, cd.marketKey, cd.label, leg.odds, leg.bookmaker, cd.observedAt, Math.round(cd.quality > 0 ? (await c.query('SELECT votes_for FROM final_decisions WHERE job_id=$1 AND fixture_id=$2', [job.id, leg.fixtureId])).rows[0].votes_for : 0), cd.probability, cd.riskLabel,
          JSON.stringify({ match: `${cd.snapshot.fixture.home} – ${cd.snapshot.fixture.away}`, home: cd.snapshot.fixture.home, away: cd.snapshot.fixture.away, league: cd.snapshot.fixture.league, kickoff: cd.snapshot.fixture.kickoff, source: cd.snapshot.odds.source })],
      );
    }
    await c.query(`UPDATE ticket_generation_jobs SET status=$2, stage='DONE', finished_at=now(), result=$3, lease_owner=NULL, lease_expires_at=NULL, checkpoint=$4 WHERE id=$1`,
      [job.id, generation, JSON.stringify({ ticketId, generation, totalOdds: chosen.length ? result.totalOdds : null }), JSON.stringify({ ...job.checkpoint, phase: 'DONE' })]);
  });
  await recordEvent(job.id, { type: 'TICKET_FINALIZED', stage: 'DONE', payload: { generation, totalOdds: chosen.length ? result.totalOdds : null, legs: chosen.length, target: Number(job.target_odds), reason: summary.reason, mixedBookmakers: result.mixedBookmakers } });
  job.status = generation;
  if (chosen.length) {
    const tid = await one<{ id: string }>('SELECT id FROM tickets WHERE job_id=$1', [job.id]);
    if (tid) await buildDigest(tid.id, job.id).catch(() => null);
  }
}

/**
 * Executes checkpointed units until the deadline. Every unit is idempotent: re-running after a crash
 * repeats at most the one interrupted model call, never the random draw.
 */
export async function runJobSlice(job: JobRow, budgetMs = 50_000) {
  const deadline = Date.now() + budgetMs;
  const cp = job.checkpoint;
  while (Date.now() < deadline) {
    if (cp.phase === 'DISCOVER') { await discover(job); continue; }
    if (cp.phase === 'BUILD') { await build(job); return 'DONE'; }
    if (cp.phase === 'DONE') return 'DONE';
    const ids = cp.batches[cp.batchIndex] ?? [];
    switch (cp.batchStep) {
      case 'FETCH': case 'SCOUT': case 'STATS': await stepFetchScoutStats(job, ids); break;
      case 'INITIAL': {
        if (!(await stepAgents(job, ids, 0, deadline))) return 'CONTINUE';
        if (config.limits.debateRounds >= 1) {
          cp.debateFixtures = await chooseDebate(job, ids, 1);
          if (cp.debateFixtures.length) cp.batchStep = 'DEBATE1';
          else { await recordEvent(job.id, { type: 'DEBATE_SKIPPED', stage: 'DEBATE', payload: { round: 1, reason: 'Pozițiile sunt deja unanime sau fără candidat comun; dezbaterea nu ar schimba rezultatul.' } }); cp.batchStep = 'VOTE'; }
        } else cp.batchStep = 'VOTE';
        await save(job);
        break;
      }
      case 'DEBATE1': case 'DEBATE2': {
        const round = cp.batchStep === 'DEBATE1' ? 1 : 2;
        if (!(await stepAgents(job, ids, round, deadline))) return 'CONTINUE';
        if (round === 1 && config.limits.debateRounds >= 2) {
          cp.debateFixtures = await chooseDebate(job, cp.debateFixtures ?? [], 2);
          cp.batchStep = cp.debateFixtures.length ? 'DEBATE2' : 'VOTE';
          if (!cp.debateFixtures.length) await recordEvent(job.id, { type: 'DEBATE_SKIPPED', stage: 'DEBATE', payload: { round: 2, reason: 'Nicio selecție nu este la un singur vot de prag.' } });
        } else cp.batchStep = 'VOTE';
        await save(job);
        break;
      }
      case 'VOTE': {
        await stepVote(job, ids);
        const { result } = await tryOptimize(job);
        const more = cp.batchIndex + 1 < cp.batches.length;
        if (result.status === 'COMPLETED' || !more) cp.phase = 'BUILD';
        else { cp.batchIndex++; cp.batchStep = 'FETCH'; }
        await save(job);
        break;
      }
      default: cp.batchStep = 'FETCH';
    }
  }
  return 'CONTINUE';
}

export const _internals = { AGENTS };
