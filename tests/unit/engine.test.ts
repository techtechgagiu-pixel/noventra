import { describe, expect, it } from 'vitest';
import { combinedOdds, expectedValue, fairProbabilities, impliedProbability, marketProbability, modelFixture, scoreMatrix } from '@/lib/stats/engine';
import { americanToDecimal, parseEspnOdds } from '@/lib/sports/espn';
import type { HistoricalMatch } from '@/lib/sports/types';

const hm = (gf: number, ga: number, venue: 'home' | 'away', sot: number | null = null, osot: number | null = null): HistoricalMatch => ({ eventKey: `e${Math.random()}`, date: '2026-09-01T12:00:00Z', competition: 'L', venue, opponent: 'X', goalsFor: gf, goalsAgainst: ga, result: gf > ga ? 'W' : gf < ga ? 'L' : 'D', shots: null, shotsOnTarget: sot, opponentShots: null, opponentShotsOnTarget: osot, possession: null, redCardsFor: 0, redCardsAgainst: 0, penaltyGoalsFor: 0, penaltyGoalsAgainst: 0, ownGoalsFor: 0, ownGoalsAgainst: 0, deflectedGoalsFor: 0, earlyRedCard: false, xg: null, source: 't' });

describe('statistical engine', () => {
  it('implied probability, EV and accumulator product', () => {
    expect(impliedProbability(2)).toBe(0.5);
    expect(expectedValue(0.55, 2)).toBeCloseTo(0.1, 10);
    expect(combinedOdds([1.5, 2, 1.8])).toBeCloseTo(5.4, 10);
  });
  it('American → decimal', () => {
    expect(americanToDecimal('+340')).toBe(4.4);
    expect(americanToDecimal('-140')).toBe(1.714);
    expect(americanToDecimal('EVEN')).toBe(2);
    expect(americanToDecimal('n/a')).toBeNull();
  });
  it('score matrix sums to ~1 and 1X2 probabilities are exhaustive', () => {
    const m = scoreMatrix(1.4, 1.1);
    const p = ['1X2:HOME', '1X2:DRAW', '1X2:AWAY'].map((k) => marketProbability(m, k)!);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    expect(marketProbability(m, 'DC:1X')!).toBeCloseTo(p[0] + p[1], 6);
    expect(marketProbability(m, 'TOTAL:OVER:2.5')! + marketProbability(m, 'TOTAL:UNDER:2.5')!).toBeCloseTo(1, 3);
  });
  it('removes bookmaker margin proportionally', () => {
    const fair = fairProbabilities([{ key: '1X2:HOME', label: '', marketType: '1X2', odds: 2 }, { key: '1X2:DRAW', label: '', marketType: '1X2', odds: 3.4 }, { key: '1X2:AWAY', label: '', marketType: '1X2', odds: 3.8 }]);
    const sum = ['1X2:HOME', '1X2:DRAW', '1X2:AWAY'].reduce((s, k) => s + fair.get(k)!.fair!, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(fair.get('1X2:HOME')!.groupMargin!).toBeGreaterThan(0);
  });
  it('missing shot data stays missing (never zero) and uncertainty is high on tiny samples', () => {
    const m = modelFixture({ homeHistory: [hm(2, 0, 'home')], awayHistory: [], markets: [{ key: '1X2:HOME', label: '', marketType: '1X2', odds: 1.8 }] });
    expect(m.usedShotsOnTarget).toBe(false);
    expect(m.uncertainty).toBe('ridicată');
    expect(m.markets[0].fairMarketProbability).toBeNull(); // incomplete 1X2 group → no fair probability invented
  });
  it('parses ESPN odds without altering prices; ±0.5 spread maps to double chance', () => {
    const raw = [{ provider: { name: 'DraftKings', displayName: 'DraftKings' }, overUnder: 2.5, moneyline: { home: { close: { odds: '+150' } }, draw: { close: { odds: '+230' } }, away: { close: { odds: '+180' } } }, total: { over: { close: { odds: '-110' } }, under: { close: { odds: '-110' } } }, pointSpread: { home: { close: { line: '+0.5', odds: '-200' } }, away: { close: { line: '-0.5', odds: '+180' } } } }];
    const s = parseEspnOdds(raw, 'A', 'B', '2026-10-19T00:00:00Z')!;
    expect(s.bookmaker).toBe('DraftKings');
    expect(s.markets.find((m) => m.key === '1X2:HOME')!.odds).toBe(2.5);
    expect(s.markets.find((m) => m.key === 'DC:1X')!.odds).toBe(1.5);
    expect(s.markets.find((m) => m.key === 'TOTAL:OVER:2.5')!.odds).toBe(1.909);
    expect(s.providerUpdatedAt).toBeNull(); // ESPN does not publish change time
  });
});
