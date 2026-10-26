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
