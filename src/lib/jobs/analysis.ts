import type { Prediction, Revision } from '../ai/agents';
import type { FixtureSnapshot } from './types';

/** Compact, identical factual snapshot for all six agents (token-efficient). */
export function agentFacts(s: FixtureSnapshot) {
  const d = s.dossier;
  const team = (t: typeof d.home) => ({
    team: t.team, sample: t.sample, record: `${t.record.w}V-${t.record.d}E-${t.record.l}Î`,
    goals: `${t.goalsForPerMatch ?? 'n/d'} marcate / ${t.goalsAgainstPerMatch ?? 'n/d'} primite pe meci`,
    shotsOnTarget: `${t.shotsOnTargetFor ?? 'n/d'} pentru / ${t.shotsOnTargetAgainst ?? 'n/d'} împotrivă pe meci`,
    finishingDelta: t.finishingDelta, verdict: t.resultsVsPerformance,
    last5: t.recent.slice(0, 5).map((r) => `${r.venue === 'acasă' ? 'A' : 'D'} ${r.score}${r.sot !== 'n/d' ? ` șp${r.sot}` : ''}${r.notes.length ? ' ' + r.notes[0] : ''}`).join('; '),
    anomalies: t.anomalies.filter((a) => a.classification !== 'INSUFFICIENT EVIDENCE').slice(0, 2).map((a) => `${a.classification === 'VERIFIED EVENT' ? 'verificat' : 'posibil noroc'}: ${a.observation}`),
  });
  return {
    fixtureId: s.fixture.id,
    match: `${s.fixture.home} – ${s.fixture.away}`,
    league: s.fixture.league,
    kickoffUtc: s.fixture.kickoff,
    standings: { home: s.standings.home, away: s.standings.away },
    scout: { home: team(d.home), away: team(d.away) },
    model: { lambdaHome: s.model.lambdaHome, lambdaAway: s.model.lambdaAway, uncertainty: s.model.uncertainty, margin1x2: s.model.bookmakerMargin1x2 },
    markets: s.model.markets.map((m) => ({ key: m.key, odds: m.odds, fair: m.fairMarketProbability, model: m.modelProbability, est: m.estimatedProbability, ev: m.expectedValue })),
    missing: d.missing.filter((x) => !/xG|Accident/.test(x)).slice(0, 2),
  };
}

export type FinalPosition = { agentId: string; decision: 'BET_CANDIDATE' | 'NO_BET'; marketKey: string | null; estimatedProbability: number | null; confidence: number; risk: string; round: number; rationale: string; provider: string; model: string };

/** Canonicalises equivalent selections so votes are comparable. */
export function canonicalMarket(key: string | null, validKeys: Set<string>): string | null {
  if (!key) return null;
  const k = key.trim().toUpperCase().replace(/\s+/g, '');
  if (validKeys.has(k)) return k;
  const aliases: Record<string, string> = { '1': '1X2:HOME', HOME: '1X2:HOME', X: '1X2:DRAW', DRAW: '1X2:DRAW', '2': '1X2:AWAY', AWAY: '1X2:AWAY', '1X': 'DC:1X', X2: 'DC:X2', '12': 'DC:12' };
  const a = aliases[k];
  return a && validKeys.has(a) ? a : null;
}

export type ConsensusResult = { outcome: 'QUALIFIED' | 'NO_CONSENSUS' | 'NO_BET'; marketKey: string | null; votesFor: number; noBetVotes: number; abstentions: number; tally: Record<string, number> };

export function consensus(positions: FinalPosition[], threshold: number, totalAgents = 6): ConsensusResult {
  const tally: Record<string, number> = {};
  let noBet = 0;
  for (const p of positions) {
    if (p.decision === 'BET_CANDIDATE' && p.marketKey) tally[p.marketKey] = (tally[p.marketKey] ?? 0) + 1;
    else noBet++;
  }
  const abstentions = totalAgents - positions.length;
  const [topKey, topVotes] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  if (topKey && topVotes >= threshold) return { outcome: 'QUALIFIED', marketKey: topKey, votesFor: topVotes, noBetVotes: noBet, abstentions, tally };
  if (noBet >= threshold) return { outcome: 'NO_BET', marketKey: null, votesFor: topVotes, noBetVotes: noBet, abstentions, tally };
  return { outcome: 'NO_CONSENSUS', marketKey: topKey, votesFor: topVotes, noBetVotes: noBet, abstentions, tally };
}

/** Fixtures that deserve a debate: a plausible consensus that is not already unanimous. */
export function contested(positions: FinalPosition[]) {
  const c = consensus(positions, 99);
  const top = Object.values(c.tally).sort((a, b) => b - a)[0] ?? 0;
  return top >= 2 && top < 6;
}

export function toPosition(agentId: string, p: Prediction | Revision, round: number, provider: string, model: string, validKeys: Set<string>): FinalPosition {
  const key = canonicalMarket(p.marketKey, validKeys);
  const decision = p.decision === 'BET_CANDIDATE' && key ? 'BET_CANDIDATE' : 'NO_BET';
  return { agentId, decision, marketKey: decision === 'BET_CANDIDATE' ? key : null, estimatedProbability: p.estimatedProbability, confidence: p.confidence, risk: p.risk, round, rationale: p.rationale, provider, model };
}

export function riskClass(prob: number | null, uncertainty: string): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (prob === null) return 'HIGH';
  const base = prob >= 0.7 ? 0 : prob >= 0.5 ? 1 : 2;
  return (['LOW', 'MEDIUM', 'HIGH'] as const)[Math.min(2, base + (uncertainty === 'ridicată' ? 1 : 0))];
}
