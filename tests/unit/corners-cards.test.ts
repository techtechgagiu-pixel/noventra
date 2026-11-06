import { describe, expect, it } from 'vitest';
import { settleMarket, needsFacts } from '../../src/lib/settlement';
import { parseTheOddsExtras } from '../../src/lib/sports/the-odds-prices';
import { MARKET_FAMILIES } from '../../src/lib/slots';
import { isBannedMarket } from '../../src/lib/jobs/analysis';
import { superbetPick } from '../../src/lib/superbet-format';

describe('cornere și cartonașe', () => {
  it('decontează cartonașele din galbene + roșii, doar când faptele sunt cunoscute', () => {
    expect(settleMarket('CARD:OVER:3.5', 1, 0, { cards: [2, 2] })).toBe('WON');
    expect(settleMarket('CARD:OVER:4.5', 1, 0, { cards: [2, 2] })).toBe('LOST');
    expect(settleMarket('CARD:OVER:3.5', 1, 0)).toBeNull();
    expect(needsFacts('CARD:OVER:3.5')).toEqual(['cards']);
    expect(needsFacts('CORN:OVER:9.5')).toEqual(['corners']);
  });
  it('citește cornerele și cartonașele de la The Odds API', () => {
    const raw = { home_team: 'A', away_team: 'B', bookmakers: [{ markets: [
      { key: 'alternate_totals_corners', outcomes: [{ name: 'Over', price: 1.9, point: 9.5 }, { name: 'Under', price: 1.9, point: 9.5 }, { name: 'Over', price: 1.5, point: 8 }] },
      { key: 'alternate_totals_cards', outcomes: [{ name: 'Over', price: 1.8, point: 3.5 }] },
    ] }] };
    const keys = parseTheOddsExtras(raw, 'A', 'B').map((m) => m.key).sort();
    expect(keys).toEqual(['CARD:OVER:3.5', 'CORN:OVER:9.5', 'CORN:UNDER:9.5']);
  });
  it('se pot bifa la bilet, iar „sub” rămâne interzis', () => {
    const ids = MARKET_FAMILIES.map((f) => f.id);
    expect(ids).toContain('CORNERS'); expect(ids).toContain('CARDS');
    expect(MARKET_FAMILIES.find((f) => f.id === 'CARDS')!.test('CARD:OVER:4.5')).toBe(true);
    expect(isBannedMarket('CARD:UNDER:4.5')).toBe(true);
    expect(isBannedMarket('CARD:OVER:4.5')).toBe(false);
  });
  it('arată cartonașele ca la Superbet', () => {
    expect(superbetPick('CARD:OVER:4.5', 'A', 'B')).toMatchObject({ market: 'Total cartonașe', pick: 'Peste 4.5' });
  });
});
