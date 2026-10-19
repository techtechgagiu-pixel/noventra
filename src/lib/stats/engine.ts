import type { HistoricalMatch, MarketQuote } from '../sports/types';

/**
 * Deterministic statistical engine. Language models never compute these numbers;
 * they receive them as facts and may criticise them.
 */

export const LEAGUE_DEFAULTS = { homeGoals: 1.5, awayGoals: 1.2 };
const PRIOR_MATCHES = 4; // shrinkage weight toward the league average
const SOT_CONVERSION = 0.31; // league-typical goals per shot on target (approximation, documented)

export const impliedProbability = (decimalOdds: number) => 1 / decimalOdds;
export const expectedValue = (p: number, decimalOdds: number) => p * decimalOdds - 1;
export const combinedOdds = (odds: number[]) => odds.reduce((a, b) => a * b, 1);

function poissonPmf(k: number, lambda: number) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

export type ScoreMatrix = number[][];
export function scoreMatrix(lambdaHome: number, lambdaAway: number, maxGoals = 10): ScoreMatrix {
  const h = Array.from({ length: maxGoals + 1 }, (_, i) => poissonPmf(i, lambdaHome));
  const a = Array.from({ length: maxGoals + 1 }, (_, j) => poissonPmf(j, lambdaAway));
  return h.map((ph) => a.map((pa) => ph * pa));
}

/** Probability that a canonical market selection wins under the score matrix. */
export function marketProbability(matrix: ScoreMatrix, key: string): number | null {
  let p = 0;
  const parts = key.split(':');
  const test = (hg: number, ag: number): boolean | null => {
    switch (parts[0]) {
      case '1X2': return parts[1] === 'HOME' ? hg > ag : parts[1] === 'AWAY' ? ag > hg : hg === ag;
      case 'DC': return parts[1] === '1X' ? hg >= ag : parts[1] === 'X2' ? ag >= hg : hg !== ag;
      case 'TOTAL': { const line = Number(parts[2]); return parts[1] === 'OVER' ? hg + ag > line : hg + ag < line; }
      case 'AH': { const line = Number(parts[2]); return parts[1] === 'HOME' ? hg + line > ag : ag + line > hg; }
      default: return null;
    }
  };
  for (let i = 0; i < matrix.length; i++) for (let j = 0; j < matrix[i].length; j++) {
    const r = test(i, j);
    if (r === null) return null;
    if (r) p += matrix[i][j];
  }
  return Math.min(1, Math.max(0, p));
}

type Rates = { scored: number; conceded: number; sample: number; usedShots: boolean };

/** Per-match attacking/defensive rates with shrinkage; blends goals with shots-on-target where present. */
export function teamRates(history: HistoricalMatch[], venue: 'home' | 'away' | 'all'): Rates {
  const games = venue === 'all' ? history : history.filter((m) => m.venue === venue);
  const prior = venue === 'away' ? { s: LEAGUE_DEFAULTS.awayGoals, c: LEAGUE_DEFAULTS.homeGoals } : { s: LEAGUE_DEFAULTS.homeGoals, c: LEAGUE_DEFAULTS.awayGoals };
  if (!games.length) return { scored: prior.s, conceded: prior.c, sample: 0, usedShots: false };
  let scored = 0, conceded = 0, usedShots = false;
  for (const g of games) {
    const sotFor = g.shotsOnTarget, sotAgainst = g.opponentShotsOnTarget;
    const underlyingFor = sotFor !== null ? sotFor * SOT_CONVERSION : null;
    const underlyingAgainst = sotAgainst !== null ? sotAgainst * SOT_CONVERSION : null;
    if (underlyingFor !== null && underlyingAgainst !== null) usedShots = true;
    scored += underlyingFor !== null ? 0.5 * g.goalsFor + 0.5 * underlyingFor : g.goalsFor;
    conceded += underlyingAgainst !== null ? 0.5 * g.goalsAgainst + 0.5 * underlyingAgainst : g.goalsAgainst;
  }
  const n = games.length;
  return {
    scored: (scored + PRIOR_MATCHES * prior.s) / (n + PRIOR_MATCHES),
    conceded: (conceded + PRIOR_MATCHES * prior.c) / (n + PRIOR_MATCHES),
    sample: n,
    usedShots,
  };
}

/** Removes the bookmaker margin proportionally inside a complete market group. */
export function fairProbabilities(markets: MarketQuote[]) {
  const out = new Map<string, { implied: number; fair: number | null; groupMargin: number | null }>();
  const groups = new Map<string, MarketQuote[]>();
  for (const m of markets) {
    const g = m.marketType === '1X2' ? '1X2' : m.marketType === 'TOTAL' ? `TOTAL:${m.line}` : m.marketType === 'HANDICAP' ? `AH:${Math.abs(m.line ?? 0)}` : m.key;
    groups.set(g, [...(groups.get(g) ?? []), m]);
  }
  for (const [g, list] of groups) {
    const complete = g === '1X2' ? list.length === 3 : g.startsWith('TOTAL') || g.startsWith('AH') ? list.length === 2 : false;
    const sum = list.reduce((s, m) => s + 1 / m.odds, 0);
    for (const m of list) out.set(m.key, { implied: 1 / m.odds, fair: complete ? 1 / m.odds / sum : null, groupMargin: complete ? sum - 1 : null });
  }
  // Double chance has no complementary price here; derive fair value from the de-margined 1X2 when available.
  const h = out.get('1X2:HOME')?.fair, d = out.get('1X2:DRAW')?.fair, a = out.get('1X2:AWAY')?.fair;
  for (const m of markets) if (m.marketType === 'DOUBLE_CHANCE' && h != null && d != null && a != null) {
    const fair = m.key === 'DC:1X' ? h + d : m.key === 'DC:X2' ? d + a : h + a;
    out.set(m.key, { implied: 1 / m.odds, fair, groupMargin: null });
  }
  return out;
}

export type MarketEstimate = {
  key: string;
  label: string;
  odds: number;
  impliedProbability: number;
  fairMarketProbability: number | null;
  modelProbability: number | null;
  /** Blend of de-margined market and model; the market gets the larger weight because it aggregates more information. */
  estimatedProbability: number | null;
  expectedValue: number | null;
};

export type FixtureModel = {
  lambdaHome: number;
  lambdaAway: number;
  sampleHome: number;
  sampleAway: number;
  usedShotsOnTarget: boolean;
  powerIndex: { home: number | null; away: number | null };
  uncertainty: 'scăzută' | 'medie' | 'ridicată';
  markets: MarketEstimate[];
  bookmakerMargin1x2: number | null;
  method: string;
};

export function modelFixture(input: { homeHistory: HistoricalMatch[]; awayHistory: HistoricalMatch[]; markets: MarketQuote[]; homePpg?: number | null; awayPpg?: number | null }): FixtureModel {
  const homeAtHome = teamRates(input.homeHistory, 'home');
  const homeAll = teamRates(input.homeHistory, 'all');
  const awayAway = teamRates(input.awayHistory, 'away');
  const awayAll = teamRates(input.awayHistory, 'all');
  // Venue-specific rates are noisy on small samples; blend with all-venue rates.
  const blend = (venue: Rates, all: Rates, key: 'scored' | 'conceded') => (venue.sample * venue[key] + 3 * all[key]) / (venue.sample + 3);
  const homeAttack = blend(homeAtHome, homeAll, 'scored') / LEAGUE_DEFAULTS.homeGoals;
  const homeDefence = blend(homeAtHome, homeAll, 'conceded') / LEAGUE_DEFAULTS.awayGoals;
  const awayAttack = blend(awayAway, awayAll, 'scored') / LEAGUE_DEFAULTS.awayGoals;
  const awayDefence = blend(awayAway, awayAll, 'conceded') / LEAGUE_DEFAULTS.homeGoals;
  const lambdaHome = clamp(LEAGUE_DEFAULTS.homeGoals * homeAttack * awayDefence, 0.2, 4.5);
  const lambdaAway = clamp(LEAGUE_DEFAULTS.awayGoals * awayAttack * homeDefence, 0.15, 4);
  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  const fair = fairProbabilities(input.markets);
  const minSample = Math.min(homeAll.sample, awayAll.sample);
  const modelWeight = minSample >= 8 ? 0.3 : minSample >= 5 ? 0.2 : minSample >= 3 ? 0.15 : 0.1;
  const markets = input.markets.map((m) => {
    const modelP = marketProbability(matrix, m.key);
    const f = fair.get(m.key);
    const fairP = f?.fair ?? null;
    const est = fairP !== null && modelP !== null ? (1 - modelWeight) * fairP + modelWeight * modelP : fairP ?? (modelP !== null ? 0.5 * modelP + 0.5 * (f?.implied ?? modelP) : null);
    return {
      key: m.key, label: m.label, odds: m.odds,
      impliedProbability: round(1 / m.odds), fairMarketProbability: fairP === null ? null : round(fairP),
      modelProbability: modelP === null ? null : round(modelP), estimatedProbability: est === null ? null : round(est),
      expectedValue: est === null ? null : round(expectedValue(est, m.odds)),
    };
  });
  return {
    lambdaHome: round(lambdaHome), lambdaAway: round(lambdaAway), sampleHome: homeAll.sample, sampleAway: awayAll.sample,
    usedShotsOnTarget: homeAll.usedShots || awayAll.usedShots,
    powerIndex: { home: input.homePpg ?? null, away: input.awayPpg ?? null },
    uncertainty: minSample >= 8 ? 'scăzută' : minSample >= 4 ? 'medie' : 'ridicată',
    markets,
    bookmakerMargin1x2: fair.get('1X2:HOME')?.groupMargin != null ? round(fair.get('1X2:HOME')!.groupMargin!) : null,
    method: `Poisson independent (goluri + șuturi pe poartă × ${SOT_CONVERSION}), micșorare spre media ligii (${PRIOR_MATCHES} meciuri), combinat cu probabilitatea pieței fără marjă (pondere model ${Math.round(modelWeight * 100)}%).`,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 10000) / 10000;
