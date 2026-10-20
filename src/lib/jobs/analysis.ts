import { selectionImplies } from '../stats/engine';
import type { Prediction, Revision } from '../ai/agents';
import type { FixtureSnapshot } from './types';

/** Compact, identical factual snapshot for all six agents (token-efficient). */
export function agentFacts(s: FixtureSnapshot, band: { minOdds: number; maxOdds: number } = { minOdds: 1.12, maxOdds: 6 }) {
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
    markets: s.model.markets.filter((m) => m.odds >= band.minOdds && m.odds <= band.maxOdds).map((m) => ({ key: m.key, odds: m.odds, book: m.bookmaker === s.odds.bookmaker ? undefined : m.bookmaker, fair: m.fairMarketProbability, model: m.modelProbability, est: m.estimatedProbability, ev: m.expectedValue })),
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

export type ConsensusResult = { outcome: 'QUALIFIED' | 'NO_CONSENSUS' | 'NO_BET'; marketKey: string | null; votesFor: number; directVotes: number; noBetVotes: number; abstentions: number; tally: Record<string, number>; supporters: string[]; requiredVotes: number; cautiousVeto: boolean };

/** The two most prudent agents. When both refuse a fixture, the bar rises to CAUTIOUS_VETO_VOTES. */
export const CAUTIOUS_AGENTS = ['victor', 'robert'];
export const CAUTIOUS_VETO_VOTES = 5;

/**
 * One vote per agent. Votes are normalised logically: a vote for a stricter selection also supports every
 * selection it implies (e.g. "Away wins" ⇒ "Draw or Away"), because an agent backing the former necessarily backs the latter.
 * Prudent choice: among keys reaching the threshold, the one backed by the MOST agents wins (ties → lower odds),
 * so a broader, safer selection beats a riskier one that only part of the group supports.
 * `availableKeys` should already be limited to the ticket's allowed price band.
 */
export function consensus(positions: FinalPosition[], threshold: number, totalAgents = 10, availableKeys?: Array<{ key: string; odds: number }>): ConsensusResult {
  const bets = positions.filter((p) => p.decision === 'BET_CANDIDATE' && p.marketKey);
  const noBet = positions.length - bets.length;
  const abstentions = totalAgents - positions.length;
  const tally: Record<string, number> = {};
  for (const b of bets) tally[b.marketKey!] = (tally[b.marketKey!] ?? 0) + 1;
  const refusedBy = new Set(positions.filter((p) => p.decision === 'NO_BET').map((p) => p.agentId));
  const cautiousVeto = CAUTIOUS_AGENTS.every((a) => refusedBy.has(a));
  const required = cautiousVeto ? Math.max(threshold, CAUTIOUS_VETO_VOTES) : threshold;
  const keys = availableKeys ?? [...new Set(bets.map((b) => b.marketKey!))].map((key) => ({ key, odds: 0 }));
  const support = keys.map((k) => {
    const supporters = bets.filter((b) => selectionImplies(b.marketKey!, k.key)).map((b) => b.agentId);
    return { key: k.key, odds: k.odds, supporters, direct: tally[k.key] ?? 0 };
  }).filter((s) => s.supporters.length > 0)
    .sort((a, b) => b.supporters.length - a.supporters.length || a.odds - b.odds || b.direct - a.direct);
  const qualified = support.find((s) => s.supporters.length >= required);
  const top = qualified ?? support[0];
  const base = { noBetVotes: noBet, abstentions, tally, requiredVotes: required, cautiousVeto };
  if (qualified) return { outcome: 'QUALIFIED', marketKey: qualified.key, votesFor: qualified.supporters.length, directVotes: qualified.direct, supporters: qualified.supporters, ...base };
  if (noBet >= threshold) return { outcome: 'NO_BET', marketKey: null, votesFor: top?.supporters.length ?? 0, directVotes: top?.direct ?? 0, supporters: top?.supporters ?? [], ...base };
  return { outcome: 'NO_CONSENSUS', marketKey: top?.key ?? null, votesFor: top?.supporters.length ?? 0, directVotes: top?.direct ?? 0, supporters: top?.supporters ?? [], ...base };
}

/**
 * Character guard: a vote is counted only if it respects the agent's own limits and the ticket's prudence rules.
 * Returns the reason a vote is set aside, or null when it counts.
 */
export function characterViolation(
  p: FinalPosition,
  agent: { name: string; maxOdds: number; minProbability: number },
  policy: { minOdds: number; maxOdds: number; minProbability: number },
  market: { odds: number; estimatedProbability: number | null } | undefined,
): string | null {
  if (p.decision !== 'BET_CANDIDATE' || !p.marketKey) return null;
  if (!market) return 'piața nu există în cotele observate';
  const cap = Math.min(agent.maxOdds, policy.maxOdds);
  if (market.odds > cap + 1e-9) return `cota ${market.odds.toFixed(2)} depășește limita ${cap.toFixed(2)} (${agent.name} max ${agent.maxOdds.toFixed(2)}, bilet max ${policy.maxOdds.toFixed(2)})`;
  if (market.odds < policy.minOdds - 1e-9) return `cota ${market.odds.toFixed(2)} este sub minimul biletului (${policy.minOdds.toFixed(2)})`;
  if (p.estimatedProbability !== null && p.estimatedProbability < agent.minProbability) return `probabilitatea proprie ${Math.round(p.estimatedProbability * 100)}% este sub pragul personal de ${Math.round(agent.minProbability * 100)}%`;
  if (market.estimatedProbability === null || market.estimatedProbability < policy.minProbability) return `motorul statistic dă ${market.estimatedProbability === null ? 'n/d' : Math.round(market.estimatedProbability * 100) + '%'}, sub minimul biletului de ${Math.round(policy.minProbability * 100)}%`;
  return null;
}

/** Fixtures that deserve a debate: a plausible consensus that is not already unanimous. */
export function contested(positions: FinalPosition[], availableKeys?: Array<{ key: string; odds: number }>, threshold = 3, total = 10) {
  // Debate where it can change the outcome: one vote short of the threshold, or a qualified pick that the majority still rejects.
  const c = consensus(positions, threshold, total, availableKeys);
  return (c.outcome !== 'QUALIFIED' && c.votesFor === c.requiredVotes - 1) || (c.outcome === 'QUALIFIED' && c.noBetVotes > total / 2);
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
