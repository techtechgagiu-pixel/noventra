import { describe, expect, it } from 'vitest';
import { DebateOutputSchema, InitialOutputSchema } from '@/lib/ai/agents';
import { agentFacts, MAX_FACT_MARKETS } from '@/lib/jobs/analysis';

describe('paid answers are not thrown away for one malformed element', () => {
  it('keeps the valid predictions and drops only the malformed one', () => {
    const r = InitialOutputSchema.parse({ predictions: [
      { fixtureId: 'espn:1', decision: 'BET_CANDIDATE', marketKey: 'DC:1X', estimatedProbability: 0.8 },
      { decision: 'BET_CANDIDATE', marketKey: 'DC:X2' },
      { fixtureId: 'espn:3', decision: 'maybe' },
    ] });
    expect(r.predictions.map((p) => p.fixtureId)).toEqual(['espn:1']);
  });

  it('accepts common field names for the same value, without changing the value', () => {
    const r = InitialOutputSchema.parse([{ fixture_id: 'espn:9', decision: 'NO BET', market_key: null, probability: '72%' }]);
    expect(r.predictions[0]).toMatchObject({ fixtureId: 'espn:9', decision: 'NO_BET', estimatedProbability: 0.72 });
    const d = DebateOutputSchema.parse({ revisions: [{ fixture_id: 'espn:9', decision: 'BET', market_key: 'BTTS:YES' }] });
    expect(d.revisions[0]).toMatchObject({ fixtureId: 'espn:9', marketKey: 'BTTS:YES', decision: 'BET_CANDIDATE' });
  });

  it('still fails when nothing in the answer is usable', () => {
    expect(() => InitialOutputSchema.parse({ predictions: [{ decision: 'x' }] })).toThrow();
  });
});

describe('compact facts', () => {
  it('sends at most 12 markets with probabilities rounded to 2 decimals', () => {
    const markets = Array.from({ length: 20 }, (_, i) => ({ key: `DC:${i}`, label: `L${i}`, odds: 1.2 + i / 100, bookmaker: 'B', fairMarketProbability: 0.71234, modelProbability: 0.6789, estimatedProbability: 0.5 + i / 100 + 0.00123, expectedValue: -0.04321 }));
    const team = { team: 'A', sample: 8, record: { w: 4, d: 2, l: 2 }, goalsForPerMatch: 1.5, goalsAgainstPerMatch: 1, shotsOnTargetFor: 4, shotsOnTargetAgainst: 3, finishingDelta: 0.12345, resultsVsPerformance: 'ok', recent: [], anomalies: [] };
    const s = { fixture: { id: 'espn:1', home: 'A', away: 'B', league: 'L', kickoff: '2026-11-01T12:00:00Z' }, standings: { home: null, away: null }, dossier: { home: team, away: { ...team, team: 'B' }, missing: [] }, model: { lambdaHome: 1.23456, lambdaAway: 0.98765, uncertainty: 'medie', bookmakerMargin1x2: 0.05432, markets }, odds: { bookmaker: 'B' }, brief: null } as never;
    const f = agentFacts(s, { minOdds: 1.1, maxOdds: 3 });
    expect(f.markets).toHaveLength(MAX_FACT_MARKETS);
    expect(f.markets[0]).toMatchObject({ fair: 0.71, model: 0.68, ev: -0.04 });
    expect(f.markets.every((m) => Math.round((m.est ?? 0) * 100) / 100 === m.est)).toBe(true);
    expect(f.model).toMatchObject({ lambdaHome: 1.23, lambdaAway: 0.99 });
  });
});
