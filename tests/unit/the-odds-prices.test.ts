import { describe, expect, it } from 'vitest';
import { parseTheOddsPrices, sameMatch } from '@/lib/sports/the-odds-prices';

const event = (bookmakers: unknown[]) => [{ id: 'e1', sport_key: 'soccer_romania_liga_1', commence_time: '2026-10-27T17:00:00Z', home_team: 'FCSB', away_team: 'CFR Cluj', bookmakers }];
const book = (h: number, d: number, a: number, over = 1.9, under = 1.9) => ({ key: 'b', markets: [
  { key: 'h2h', outcomes: [{ name: 'FCSB', price: h }, { name: 'CFR Cluj', price: a }, { name: 'Draw', price: d }] },
  { key: 'totals', outcomes: [{ name: 'Over', price: over, point: 2.5 }, { name: 'Under', price: under, point: 2.5 }] },
] });

describe('The Odds API prices', () => {
  it('takes the median of the listed bookmakers and keeps only complete markets', () => {
    const [e] = parseTheOddsPrices(event([book(2.0, 3.2, 3.8), book(2.1, 3.3, 3.6, 2.0, 1.8), book(1.9, 3.4, 4.0)]));
    expect(e.books).toBe(3);
    expect(e.markets.find((m) => m.key === '1X2:HOME')?.odds).toBe(2.0);
    expect(e.markets.find((m) => m.key === '1X2:AWAY')?.odds).toBe(3.8);
    expect(e.markets.find((m) => m.key === 'TOTAL:OVER:2.5')?.odds).toBe(1.9);
    expect(e.markets.some((m) => m.key.startsWith('DC:'))).toBe(false); // never derived
  });
  it('drops an event without a complete price set', () => {
    expect(parseTheOddsPrices(event([{ key: 'b', markets: [{ key: 'h2h', outcomes: [{ name: 'FCSB', price: 2 }] }] }]))).toEqual([]);
    expect(parseTheOddsPrices('nope')).toEqual([]);
  });
  it('matches the same fixture across providers by both teams, order and kickoff', () => {
    const espn = { home: 'FCSB', away: 'CFR 1907 Cluj', kickoff: '2026-10-27T17:00:00Z' };
    expect(sameMatch(espn, { home: 'FCSB', away: 'CFR Cluj', kickoff: '2026-10-27T17:05:00Z' })).toBe(true);
    expect(sameMatch(espn, { home: 'CFR Cluj', away: 'FCSB', kickoff: '2026-10-27T17:00:00Z' })).toBe(false);
    expect(sameMatch(espn, { home: 'FCSB', away: 'CFR Cluj', kickoff: '2026-10-27T19:00:00Z' })).toBe(false);
    expect(sameMatch({ home: 'Manchester United', away: 'Wolverhampton Wanderers', kickoff: '2026-10-27T15:00:00Z' }, { home: 'Manchester United', away: 'Wolverhampton', kickoff: '2026-10-27T15:00:00Z' })).toBe(true);
  });
});

describe('The Odds API as main price source', () => {
  it('uses The Odds API for the markets it lists and keeps ESPN for the rest, each tagged with its source', async () => {
    const { mergeTheOdds } = await import('@/lib/sports/the-odds-prices');
    const f = { id: 'x', provider: 'espn', home: 'A', away: 'B', kickoff: '2026-11-01T12:00:00Z', status: 'pre', odds: { bookmaker: 'DraftKings', source: 'espn', observedAt: 'o', providerUpdatedAt: null, markets: [
      { key: '1X2:HOME', label: 'A (1)', marketType: '1X2', odds: 1.8 }, { key: 'DC:1X', label: '1X', marketType: 'DOUBLE_CHANCE', odds: 1.2 }] } } as never;
    const e = { id: 'e', home: 'A FC', away: 'B FC', kickoff: '2026-11-01T12:00:00Z', books: 7, markets: [
      { key: '1X2:HOME', label: 'A FC câștigă (1)', marketType: '1X2', odds: 1.85 }, { key: 'TOTAL:OVER:1.5', label: 'Peste 1.5 goluri', marketType: 'TOTAL', odds: 1.3, line: 1.5 }] } as never;
    const out = mergeTheOdds(f, e, '2026-10-27T00:00:00Z');
    const by = Object.fromEntries(out.odds!.markets.map((m) => [m.key, m]));
    expect(by['1X2:HOME']).toMatchObject({ odds: 1.85, label: 'A câștigă (1)', bookmaker: 'The Odds API · mediana a 7 case' });
    expect(by['TOTAL:OVER:1.5'].odds).toBe(1.3);
    expect(by['DC:1X']).toMatchObject({ odds: 1.2, bookmaker: 'DraftKings' });
    expect(out.odds!.source).toBe('the-odds-api');
  });
  it('caps the markets sent to agents to the most likely ones', async () => {
    const { topMarkets } = await import('@/lib/jobs/analysis');
    const ms = Array.from({ length: 25 }, (_, i) => ({ key: `K${i}`, estimatedProbability: i / 25 }));
    const kept = topMarkets(ms);
    expect(kept).toHaveLength(18); expect(kept[0].key).toBe('K7');
  });
});
