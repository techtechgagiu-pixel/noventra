import { fairProbabilities, type FixtureModel } from '../stats/engine';
import type { MarketQuote } from '../sports/types';
import { csSelectionWins } from './markets';

/**
 * Deterministic CS model (no language model computes these numbers):
 * 1. map win probability from the Valve Regional Standings points (logistic, 400-point scale, like Elo), nudged by
 *    the recent map record of both teams (max ±8%);
 * 2. every possible series score for the format (BO1/BO3/BO5), maps assumed independent;
 * 3. each selection's probability under those scores, blended with the de-margined market price
 *    (the market gets the larger weight, as in football).
 */
export type CsTeamInput = { points: number | null; mapsWon: number; mapsLost: number; matches: number };

export function mapWinProbability(home: CsTeamInput, away: CsTeamInput): number | null {
  if (home.points === null || away.points === null) return null;
  const elo = 1 / (1 + 10 ** ((away.points - home.points) / 400));
  const rate = (t: CsTeamInput) => (t.mapsWon + 2) / (t.mapsWon + t.mapsLost + 4); // shrunk toward 50%
  const form = Math.max(-0.08, Math.min(0.08, (rate(home) - rate(away)) * 0.25));
  return Math.max(0.03, Math.min(0.97, elo + form));
}

/** Probability of every final series score [homeMaps, awayMaps] for a best-of-n with map probability p. */
export function seriesScores(p: number, bestOf: number): Array<{ h: number; a: number; p: number }> {
  const need = Math.floor(bestOf / 2) + 1;
  const out: Array<{ h: number; a: number; p: number }> = [];
  const choose = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
  for (let lost = 0; lost < need; lost++) {
    out.push({ h: need, a: lost, p: choose(need - 1 + lost, lost) * p ** need * (1 - p) ** lost });
    out.push({ h: lost, a: need, p: choose(need - 1 + lost, lost) * (1 - p) ** need * p ** lost });
  }
  return out;
}

const round = (v: number) => Math.round(v * 10000) / 10000;

export function modelCsFixture(input: { home: CsTeamInput; away: CsTeamInput; bestOf: number | null; markets: MarketQuote[] }): FixtureModel {
  const bo = input.bestOf && [1, 3, 5].includes(input.bestOf) ? input.bestOf : 3;
  const p = mapWinProbability(input.home, input.away);
  const scores = p === null ? null : seriesScores(p, bo);
  const fairMap = fairProbabilities(input.markets);
  const sample = Math.min(input.home.matches, input.away.matches);
  const modelWeight = p === null ? 0 : sample >= 8 ? 0.3 : sample >= 4 ? 0.2 : 0.12;
  const markets = input.markets.map((m) => {
    const modelP = scores ? scores.reduce((s, x) => s + (csSelectionWins(m.key, x.h, x.a) ? x.p : 0), 0) : null;
    const fairP = fairMap.get(m.key)?.fair ?? null;
    const est = fairP !== null && modelP !== null ? (1 - modelWeight) * fairP + modelWeight * modelP : fairP ?? (modelP !== null ? 0.5 * modelP + 0.5 / m.odds : null);
    return {
      key: m.key, label: m.label, odds: m.odds, bookmaker: m.bookmaker, impliedProbability: round(1 / m.odds),
      fairMarketProbability: fairP === null ? null : round(fairP), modelProbability: modelP === null ? null : round(modelP),
      estimatedProbability: est === null ? null : round(est), expectedValue: est === null ? null : round(est * m.odds - 1),
    };
  });
  const ml = fairMap.get('ML:HOME');
  return {
    lambdaHome: 0, lambdaAway: 0, sampleHome: input.home.matches, sampleAway: input.away.matches, usedShotsOnTarget: false,
    powerIndex: { home: input.home.points, away: input.away.points },
    uncertainty: p === null || sample < 4 ? 'ridicată' : sample >= 8 ? 'scăzută' : 'medie',
    markets, bookmakerMargin1x2: ml?.groupMargin != null ? round(ml.groupMargin) : null,
    method: p === null
      ? 'CS2: cel puțin o echipă lipsește din clasamentul Valve — doar probabilitatea pieței fără marjă.'
      : `CS2: probabilitate pe hartă ${Math.round(p * 100)}% din punctele Valve (scara 400) ajustată cu forma pe hărți, toate scorurile posibile BO${bo}, combinat cu piața fără marjă (pondere model ${Math.round(modelWeight * 100)}%).`,
  };
}
